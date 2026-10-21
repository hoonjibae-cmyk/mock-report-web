import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {lookupStudents} from '@/lib/student-directory';
import {applyAssignedClass,notificationDecision,placementGrade,preferredSchedule} from '@/lib/placement-policy';
import {isGenericReport,type GenericReportData} from '@/lib/omr-report-types';
import {deliverToClassfit} from '@/lib/classfit-delivery';

export const PLACEMENT_CHANNEL='C06PAG818TZ';
type PlacementRequest={report_id:string;exam_id:string;student_key:string;grade:string;preferred_schedule:string;workspace_id:string|null;notification_state:string;image_token:string;requested_at:string};
type Member={studentId:string;classId:string;excluded?:boolean};
type PlacementStudent={id:string;cardNo:string;reportId?:string;examId?:string;removed?:boolean;registryStatus?:string};
type PlacementWorkspace={id:string;state:{students:PlacementStudent[];memberships:Member[];classes:Array<{id:string;name:string;schedule?:string;archived?:boolean}>}};
export function summarySignature(token:string,expires:number){return createHmac('sha256',process.env.AUTH_SECRET??'').update(`placement-summary:${token}:${expires}`).digest('hex');}
export function validSummarySignature(token:string,expires:number,signature:string){
  if(!process.env.AUTH_SECRET||!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+8*86400000)return false;
  const a=Buffer.from(signature),b=Buffer.from(summarySignature(token,expires));return a.length===b.length&&timingSafeEqual(a,b);
}
function summaryUrl(token:string){const expires=Date.now()+7*86400000;return `https://report.yussam.com/api/placement/summary/${token}?expires=${expires}&signature=${summarySignature(token,expires)}`;}
async function notifyRequest(row:PlacementRequest,name:string){
  const client=getSupabaseAdmin(),claim=randomUUID();
  const destination=await client.from('placement_requests').select('workspace_id,grade').eq('report_id',row.report_id).single();
  if(destination.error||!destination.data.workspace_id)throw Error('Where’s My Class? 자동 반영 후 알림을 보낼 수 있습니다.');
  const classfitUrl=`https://classfit.yussam.com/?workspace=${encodeURIComponent(destination.data.workspace_id)}&grade=${encodeURIComponent(destination.data.grade)}`;
  const {data,error}=await client.rpc('placement_claim_notification',{p_report_id:row.report_id,p_claim:claim});
  if(error)throw Error('반배정 알림 처리에 필요한 데이터베이스 업데이트를 확인해 주세요.');
  if(!data?.length)return {state:row.notification_state};
  let state='uncertain',reason='알림 응답을 확인하지 못했습니다. 중복 전송을 막기 위해 채널 확인이 필요합니다.';
  try{
    const response=await fetch(`${(process.env.HR_API_URL??'').replace(/\/$/,'')}/api/slack/notify`,{method:'POST',headers:{'content-type':'application/json','x-app':'omr-report','x-api-key':process.env.HR_API_KEY??''},body:JSON.stringify({channel:PLACEMENT_CHANNEL,text:`반배정 요청 · ${name}\n선호 요일: ${row.preferred_schedule}\n${classfitUrl}`,imageUrl:summaryUrl(row.image_token),imageAlt:`${name} 반배치고사 성적 요약 · 선호 요일 ${row.preferred_schedule}`}),signal:AbortSignal.timeout(25000)});
    const result=await response.json().catch(()=>null);
    if(result?.delivered===true&&result.imageIncluded===true){state='sent';reason='';}
    else if(result?.delivered===false||response.status===400||response.status===401||response.status===403){state='error';reason=result?.error??'슬랙 알림 서비스 설정을 확인해 주세요.';}
  }catch{/* 통신 단절은 전송 실패와 다르므로 자동 재전송하지 않는다. */}
  const {error:updateError}=await client.from('placement_requests').update({notification_state:state,notification_reason:reason||null,notification_at:new Date().toISOString()}).eq('report_id',row.report_id).eq('notification_claim',claim);
  if(updateError)throw Error('슬랙 응답 기록을 저장하지 못했습니다. 중복 전송을 피하려면 채널을 먼저 확인해 주세요.');
  return {state,reason};
}
export async function requestPlacement(rows:Array<{id:string;key:string;data:GenericReportData;grade?:string;preferredSchedule?:unknown}>,actor:string){
  const client=getSupabaseAdmin(),directory=await lookupStudents(rows.map(r=>r.key));
  const savedRows:Array<{saved:PlacementRequest;name:string;decision:string}>=[];
  for(const row of rows){
    const student=directory.students.get(row.key),decision=directory.error?'hold':notificationDecision(student);
    const grade=placementGrade(row.grade??student?.grade??'',student?.schoolLevel??'');
    const schedule=preferredSchedule(row.preferredSchedule);if(!grade||!schedule)throw Error(`${row.data.student.name}: 학년과 선호 요일을 확인해 주세요.`);
    const {data:existing,error:readError}=await client.from('placement_requests').select('*').eq('exam_id',row.data.examId).eq('student_key',row.key).maybeSingle();if(readError)throw Error('반배정 요청 데이터베이스 업데이트를 확인해 주세요.');
    let saved=existing as PlacementRequest|null;
    let created=false;
    if(!saved){const {data,error}=await client.from('placement_requests').upsert({report_id:row.id,exam_id:row.data.examId,student_key:row.key,grade,preferred_schedule:schedule,requested_by:actor,notification_state:decision==='send'?'pending':decision==='skip'?'skipped':'blocked',notification_reason:decision==='hold'?'Student Card의 재원 여부 확인이 필요합니다.':null},{onConflict:'exam_id,student_key',ignoreDuplicates:true}).select('*').maybeSingle();if(error)throw Error('반배정 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');saved=data as PlacementRequest|null;created=!!saved;
      if(!saved){const current=await client.from('placement_requests').select('*').eq('exam_id',row.data.examId).eq('student_key',row.key).single();if(current.error)throw Error('반배정 요청 상태를 확인하지 못했습니다.');saved=current.data as PlacementRequest;}
    }
    if(!created){const patch:Record<string,unknown>={report_id:row.id,grade,preferred_schedule:schedule};if(['blocked','skipped','error','pending'].includes(saved.notification_state)){patch.notification_state=decision==='send'?'pending':decision==='skip'?'skipped':'blocked';patch.notification_reason=decision==='hold'?'Student Card의 재원 여부 확인이 필요합니다.':null;}
      const {data,error}=await client.from('placement_requests').update(patch).eq('report_id',saved.report_id).eq('notification_state',saved.notification_state).select('*').maybeSingle();if(error)throw Error('반배정 요청을 갱신하지 못했습니다.');
      if(data)saved=data as PlacementRequest;else{const current=await client.from('placement_requests').select('*').eq('exam_id',row.data.examId).eq('student_key',row.key).single();if(current.error)throw Error('반배정 요청 상태를 확인하지 못했습니다.');saved=current.data as PlacementRequest;}
    }
    savedRows.push({saved,name:row.data.student.name,decision});
  }
  // Persist ClassFit first: following the Slack link must immediately show the request.
  await deliverToClassfit(savedRows.map(r=>r.saved.report_id));
  const results=[];let immediate=0;
  for(const {saved,name,decision} of savedRows){
    const sendNow=decision==='send'&&immediate===0&&['pending','error'].includes(saved.notification_state);if(sendNow)immediate++;
    const notification=sendNow?await notifyRequest(saved,name):{state:saved.notification_state};
    results.push({reportId:saved.report_id,studentKey:saved.student_key,name,preferredSchedule:saved.preferred_schedule,notification:notification.state,reason:'reason' in notification?notification.reason:undefined});
  }
  return results;
}
export async function dispatchPlacementNotifications(){
  const client=getSupabaseAdmin(),retryBefore=new Date(Date.now()-5*60000).toISOString();
  // Recover old unlinked requests as well as deliveries interrupted before Slack.
  const backlog=await client.from('placement_requests').select('report_id,exams!inner(omr_config)').is('workspace_id',null).not('exams.omr_config->>classfit_workspace_id','is',null).order('requested_at').limit(100);
  if(backlog.error)throw Error('Where’s My Class? 자동 반영 대기를 확인하지 못했습니다.');
  if(backlog.data?.length)await deliverToClassfit(backlog.data.map(r=>r.report_id));
  // 중간에 실행이 끊긴 요청은 실제 전송 여부를 알 수 없다. 재전송 대신 확인 대상으로 남긴다.
  const stale=await client.from('placement_requests').update({notification_state:'uncertain',notification_reason:'알림 처리가 중단되었습니다. 중복 전송을 피하려면 슬랙 채널을 확인해 주세요.'}).eq('notification_state','sending').lt('notification_at',retryBefore);
  if(stale.error)throw Error('반배정 알림 처리 상태를 확인하지 못했습니다.');
  const {data:rows,error}=await client.from('placement_requests').select('*').in('notification_state',['pending','error','blocked']).or(`notification_at.is.null,notification_at.lt.${retryBefore}`).order('requested_at').limit(20);if(error)throw Error('반배정 알림 대기를 불러오지 못했습니다.');
  if(!rows?.length)return {checked:0,sent:0};
  const directory=await lookupStudents(rows.map(r=>r.student_key));if(directory.error||!directory.configured)return {checked:rows.length,sent:0,held:true};
  let checked=0,sent=0;const deadline=Date.now()+55000;
  for(const row of rows){if(Date.now()+26000>deadline)break;const decision=notificationDecision(directory.students.get(row.student_key));if(decision==='hold'){
      const held=await client.from('placement_requests').update({notification_state:'blocked',notification_at:new Date().toISOString(),notification_reason:'Student Card의 재원 여부 확인이 필요합니다.'}).eq('report_id',row.report_id).eq('notification_state',row.notification_state);if(held.error)throw Error('알림 보류 상태를 기록하지 못했습니다.');checked++;continue;
    }
    if(decision==='skip'){await client.from('placement_requests').update({notification_state:'skipped',notification_reason:null}).eq('report_id',row.report_id).eq('notification_state',row.notification_state);checked++;continue;}
    if(row.notification_state==='blocked'){const changed=await client.from('placement_requests').update({notification_state:'pending',notification_reason:null}).eq('report_id',row.report_id).eq('notification_state','blocked').select('report_id');if(!changed.data?.length)continue;}
    const {data:report}=await client.from('student_reports').select('student_name,is_active').eq('id',row.report_id).maybeSingle();if(!report?.is_active)continue;
    try{await deliverToClassfit([row.report_id]);}catch{console.warn('ClassFit delivery pending; Slack deferred');continue;}
    const result=await notifyRequest({...row,notification_state:'pending'},report.student_name);checked++;if(result.state==='sent')sent++;
    await new Promise(resolve=>setTimeout(resolve,1100));
  }
  return {checked,sent};
}
export async function resolveAssignedReport(reportId:string,workspaceId?:string,classId?:string):Promise<{report:GenericReportData|null;reason?:string;classes?:Array<{id:string;name:string}>}>{
  const client=getSupabaseAdmin();const {data:row,error}=await client.from('student_reports').select('id,student_key,report_data,is_active,exam_id').eq('id',reportId).maybeSingle();
  if(error||!row||!row.is_active||!isGenericReport(row.report_data))return {report:null,reason:'성적표를 찾을 수 없습니다.'};
  const body=row.report_data;if(body.examType!=='placement')return {report:body};
  const {data:request,error:requestError}=await client.from('placement_requests').select('workspace_id').eq('report_id',reportId).maybeSingle();
  if(requestError)throw Error('반배정 데이터베이스 업데이트를 확인해 주세요.');
  const targetId=workspaceId||request?.workspace_id;if(!targetId)return {report:null,reason:'반배정을 마친 뒤 성적표를 출력할 수 있습니다.'};
  const {data:w,error:workspaceError}=await client.from('placement_workspaces').select('id,state').eq('id',targetId).maybeSingle();if(workspaceError||!w)return {report:null,reason:'반편성 회차를 확인해 주세요.'};
  // 카드번호(=student_key)로 맞추되, Where’s My Class?이 성적표 ID를 들고 있으면 그것으로도 맞춘다(카드번호 없는 신규생)
  const workspace=w as PlacementWorkspace,s=workspace.state.students.find(s=>!s.removed&&(s.cardNo===row.student_key||s.reportId===row.id)&&s.registryStatus!=='withdrawn');
  const membership=s?workspace.state.memberships.filter(m=>m.studentId===s.id&&!m.excluded):[];
  const classes=workspace.state.classes.filter(c=>!c.archived&&membership.some(m=>m.classId===c.id));
  const assigned=classId?classes.find(c=>c.id===classId):classes.length===1?classes[0]:null;
  if(!assigned)return {report:null,classes:classes.map(c=>({id:c.id,name:c.name})),reason:classes.length>1?'출력할 배정 반을 선택해 주세요.':'반배정을 마친 뒤 성적표를 출력할 수 있습니다.'};
  if(!request||request.workspace_id!==workspace.id)return {report:null,reason:'이 회차에 반배정 요청을 먼저 불러와 주세요.'};
  const ids=new Set(workspace.state.memberships.filter(m=>m.classId===assigned.id&&!m.excluded).map(m=>m.studentId));
  const keys=[...new Set(workspace.state.students.filter(s=>ids.has(s.id)&&!s.removed&&s.registryStatus!=='withdrawn').map(s=>s.cardNo).filter(Boolean))];
  const peers:GenericReportData[]=[];
  for(let from=0;;from+=500){const {data,error}=await client.from('student_reports').select('student_key,report_data,created_at').eq('exam_id',row.exam_id).eq('is_active',true).in('student_key',keys).order('created_at',{ascending:false}).range(from,from+499);if(error)throw Error('배정 반의 성적 평균을 불러오지 못했습니다.');for(const peer of data??[])if(isGenericReport(peer.report_data)&&!peers.some(p=>p.student.key===peer.student_key))peers.push(peer.report_data);if((data?.length??0)<500)break;}
  return {report:applyAssignedClass(body,peers,`${assigned.name}${assigned.schedule?` · ${assigned.schedule}`:''}`)};
}
export async function placementStatuses(examId:string){
  const client=getSupabaseAdmin(),{data:rows,error}=await client.from('placement_requests').select('report_id,student_key,workspace_id,preferred_schedule,notification_state').eq('exam_id',examId).order('requested_at');if(error)throw Error('반배정 요청 데이터베이스 업데이트를 확인해 주세요.');
  if(!rows?.length)return [];
  const workspaceIds=[...new Set(rows.map(r=>r.workspace_id).filter(Boolean))];
  const {data:workspaces}=workspaceIds.length?await client.from('placement_workspaces').select('id,state').in('id',workspaceIds):{data:[]};
  const {data:reports}=await client.from('student_reports').select('id,student_name').in('id',rows.map(r=>r.report_id));
  return rows.map(r=>{const w=(workspaces??[]).find(w=>w.id===r.workspace_id) as PlacementWorkspace|undefined,s=w?.state.students.find(s=>(s.cardNo===r.student_key||s.reportId===r.report_id)&&!s.removed&&s.registryStatus!=='withdrawn');
    const classes=s?w!.state.classes.filter(c=>!c.archived&&w!.state.memberships.some(m=>!m.excluded&&m.studentId===s.id&&m.classId===c.id)):[];
    return {reportId:r.report_id,name:reports?.find(p=>p.id===r.report_id)?.student_name??r.student_key,preferredSchedule:r.preferred_schedule,notification:r.notification_state,classes:classes.map(c=>({id:c.id,name:c.name,url:`/placement/print/${r.report_id}?workspace=${w!.id}&class=${encodeURIComponent(c.id)}`}))};
  });
}
