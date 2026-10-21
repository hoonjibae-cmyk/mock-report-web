import {NextResponse} from 'next/server';
import {authorizeApi} from '@/lib/api-auth';
import {getVisibleExam} from '@/lib/exam-access';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {requireClassfitWorkspace} from '@/lib/classfit-workspaces';
import {deliverToClassfit} from '@/lib/classfit-delivery';
export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await authorizeApi('createReports');if(auth.response)return auth.response;
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'같은 사이트에서 요청해 주세요.'},{status:403});
  try{
    const exam=await getVisibleExam((await params).id);if(!exam||exam.examType!=='placement')return NextResponse.json({error:'반배치고사 시험을 찾을 수 없습니다.'},{status:404});
    const {workspaceId}=await request.json(),workspace=await requireClassfitWorkspace(workspaceId),client=getSupabaseAdmin();
    if(exam.omrConfig.classfit_workspace_id&&exam.omrConfig.classfit_workspace_id!==workspace.id){
      const requests=await client.from('placement_requests').select('report_id',{count:'exact',head:true}).eq('exam_id',exam.id);
      if(requests.error)throw Error('기존 요청을 확인하지 못했습니다.');
      if(requests.count)return NextResponse.json({error:'반배정 요청을 보낸 시험은 회차를 변경할 수 없습니다.'},{status:409});
    }
    const bound=await client.from('placement_requests').select('workspace_id').eq('exam_id',exam.id).not('workspace_id','is',null);
    if(bound.error)throw Error('기존 회차 연결을 확인하지 못했습니다.');
    if(bound.data.some(r=>r.workspace_id!==workspace.id))return NextResponse.json({error:'이미 다른 회차에 반영된 요청이 있습니다. 기존 배정을 확인해 주세요.'},{status:409});
    const saved=await client.from('exams').update({omr_config:{...exam.omrConfig,classfit_workspace_id:workspace.id}}).eq('id',exam.id);
    if(saved.error)throw Error('반편성 회차를 저장하지 못했습니다.');
    const pending=await client.from('placement_requests').select('report_id').eq('exam_id',exam.id);
    if(pending.error)throw Error('기존 반배정 요청을 확인하지 못했습니다.');
    let syncPending=false;try{await deliverToClassfit(pending.data.map(r=>r.report_id));}catch{syncPending=true;}
    return NextResponse.json({workspace,syncPending});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'회차 저장에 실패했습니다.'},{status:400});}
}
