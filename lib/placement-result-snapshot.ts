import {createHash} from 'node:crypto';
import type {GenericReportData} from './omr-report-types';
import {isGenericReport} from './omr-report-types';
import {getSupabaseAdmin} from './supabase-admin';

// Keep exactly the fields drawn in the Slack image. Rebuilding an unchanged report
// must not create a new attempt; a new scanned answer sheet must.
export function placementResultSnapshot(report:GenericReportData,schedule:string){
 return {family:'C_generic',schemaVersion:2,examId:report.examId,examTitle:report.examTitle,examDate:report.examDate,
  student:{key:report.student.key,name:report.student.name,school:report.student.school??''},
  score:{raw:report.score.raw,max:report.score.max},
  areas:report.areas.map(a=>({area:a.area,earned:a.earned,possible:a.possible,estimated:!!a.estimated})),
  sourceScan:report.sourceScan?{id:report.sourceScan.id,uploadedAt:report.sourceScan.uploadedAt}:null,schedule};
}
export function placementResultFingerprint(rootId:string,reportId:string,report:GenericReportData,schedule:string){
 const snapshot=placementResultSnapshot(report,schedule);
 const digest=createHash('sha256').update(JSON.stringify({rootId,attempt:report.sourceScan?.id??reportId,snapshot})).digest('hex');
 return `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
}
function hrHeaders(){return {'content-type':'application/json','x-app':'omr-report','x-api-key':process.env.HR_API_KEY??''};}
function hrUrl(){const base=(process.env.HR_API_URL??'').replace(/\/$/,'');if(!base||!process.env.HR_API_KEY)throw Error('반배정 알림 연동 설정을 확인해 주세요.');return `${base}/api/slack/placement-results`;}
export async function registerPlacementSnapshot(rootId:string,reportId:string,report:GenericReportData,schedule:string,alreadySent=false){
 const response=await fetch(hrUrl(),{method:'POST',headers:hrHeaders(),body:JSON.stringify({rootId,fingerprint:placementResultFingerprint(rootId,reportId,report,schedule),report:placementResultSnapshot(report,schedule),schedule,alreadySent}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('발송 당시 성적표를 보관하지 못했습니다. 기존 알림은 변경하지 않았습니다.');
 return response.json() as Promise<{id:string;state:string;root:boolean}>;
}
export async function readPlacementSnapshot(id:string){
 const response=await fetch(`${hrUrl()}?id=${encodeURIComponent(id)}`,{headers:hrHeaders(),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(response.status===404)return null;
 if(!response.ok)throw Error('보관된 성적표를 읽지 못했습니다.');
 return response.json() as Promise<{report:GenericReportData;schedule:string}>;
}
// Existing report rows are updated in place. Capture their old image before that
// write, not only later when the placement request pointer is refreshed.
export async function freezePlacementReportImage(reportId:string){
 const db=getSupabaseAdmin();
 const request=await db.from('placement_requests').select('image_token,preferred_schedule,notification_state').eq('report_id',reportId).maybeSingle();
 if(request.error)throw Error('기존 반배정 이미지 보관 상태를 확인하지 못했습니다.');
 if(!request.data||!['sent','sending','uncertain'].includes(request.data.notification_state))return;
 const report=await db.from('student_reports').select('report_data').eq('id',reportId).single();
 if(report.error||!isGenericReport(report.data?.report_data))throw Error('기존 반배정 성적표를 보관하지 못했습니다.');
 await registerPlacementSnapshot(request.data.image_token,reportId,report.data.report_data,request.data.preferred_schedule,true);
}
