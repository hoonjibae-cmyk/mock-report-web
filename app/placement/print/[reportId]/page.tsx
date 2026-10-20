import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import GenericReport from '@/components/GenericReport';
import {getCurrentUser,hasPermission,canViewExamType} from '@/lib/auth';
import {PRINT_COOKIE,validPrintScope} from '@/lib/placement-print';
import {resolveAssignedReport} from '@/lib/placement-service';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {getExamOverview,parseTeacherComment} from '@/lib/omr-comments';
export const dynamic='force-dynamic';
export default async function PlacementPrint({params,searchParams}:{params:Promise<{reportId:string}>;searchParams:Promise<{workspace?:string;class?:string}>}){
  const {reportId}=await params,q=await searchParams,workspaceId=q.workspace??'',classId=q.class??'';
  const user=await getCurrentUser(),staff=!!user&&hasPermission(user,'exportReports')&&canViewExamType(user,'placement');
  if(!staff&&!validPrintScope((await cookies()).get(PRINT_COOKIE)?.value,{reportId,workspaceId,classId}))redirect(`/login?next=${encodeURIComponent(`/placement/print/${reportId}?workspace=${workspaceId}&class=${classId}`)}`);
  const result=await resolveAssignedReport(reportId,workspaceId,classId);
  if(!result.report)return <main className="login-shell"><section className="login-card"><h1>반배정 확인</h1><p>{result.reason}</p>{result.classes?.map(c=><p key={c.id}><a href={`?workspace=${workspaceId}&class=${encodeURIComponent(c.id)}`}>{c.name} 성적표</a></p>)}<a href="https://classfit.yussam.com">반편성관리 열기</a></section></main>;
  const {data:row}=await getSupabaseAdmin().from('student_reports').select('teacher_comment').eq('id',reportId).single();
  const personal=parseTeacherComment(row?.teacher_comment),overview=await getExamOverview(result.report.examId).catch(()=>null);
  const overviewFinal=overview?.status==='final',personalFinal=personal.status==='final';
  return <GenericReport report={result.report} comments={{overview:overviewFinal?overview.final:null,style:overview?.style??'free',areaNotes:overviewFinal?overview.areaNotes:[],personal:personalFinal?personal.personalFinal:null,areaFeedback:personalFinal?personal.areaFeedback:[],keywords:personalFinal?personal.displayKeywords:[]}}/>;
}
