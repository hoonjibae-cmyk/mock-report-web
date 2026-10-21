import {isGenericReport} from '@/lib/omr-report-types';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import GenericReport from '@/components/GenericReport';
import EmbeddedReportSize from '@/components/EmbeddedReportSize';
import {getCurrentUser,hasPermission,canViewExamType} from '@/lib/auth';
import {PRINT_COOKIE,validPrintScope} from '@/lib/placement-print';
import {resolveAssignedReport} from '@/lib/placement-service';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {getExamOverview,parseTeacherComment} from '@/lib/omr-comments';
export const dynamic='force-dynamic';
export default async function PlacementPrint({params,searchParams}:{params:Promise<{reportId:string}>;searchParams:Promise<{workspace?:string;class?:string;preview?:string}>}){
  const {reportId}=await params,q=await searchParams,workspaceId=q.workspace??'',classId=q.class??'';
  const scoped=validPrintScope((await cookies()).get(PRINT_COOKIE)?.value,{reportId,workspaceId,classId});
  const user=scoped?null:await getCurrentUser(),staff=!!user&&hasPermission(user,'exportReports')&&canViewExamType(user,'placement');
  if(!scoped&&!staff)redirect(`/login?next=${encodeURIComponent(`/placement/print/${reportId}?workspace=${workspaceId}&class=${classId}`)}`);
  const result=await resolveAssignedReport(reportId,workspaceId,classId);
  const {data:source}=q.preview==='1'&&!result.report?await getSupabaseAdmin().from('student_reports').select('report_data,is_active,teacher_comment').eq('id',reportId).single():{data:null};
  const report=result.report??(source?.is_active&&isGenericReport(source.report_data)&&source.report_data.examType==='placement'?source.report_data:null);
  if(!report)return <main className="login-shell"><section className="login-card"><h1>반배정 확인</h1><p>{result.reason}</p>{result.classes?.map(c=><p key={c.id}><a href={`?workspace=${workspaceId}&class=${encodeURIComponent(c.id)}`}>{c.name} 성적표</a></p>)}<a href="https://classfit.yussam.com">반편성관리 열기</a></section></main>;
  const overview=await getExamOverview(report.examId).catch(()=>null);
  const personal=parseTeacherComment(result.report?result.teacherComment:source?.teacher_comment);
  const overviewFinal=overview?.status==='final',personalFinal=personal.status==='final';
  return <EmbeddedReportSize enabled={q.preview==='1'}><GenericReport report={report} comments={{overview:overviewFinal?overview.final:null,style:overview?.style??'free',areaNotes:overviewFinal?overview.areaNotes:[],personal:personalFinal?personal.personalFinal:null,areaFeedback:personalFinal?personal.areaFeedback:[],keywords:personalFinal?personal.displayKeywords:[]}}/></EmbeddedReportSize>;
}
