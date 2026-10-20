import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {PRINT_COOKIE,signPrintScope} from '@/lib/placement-print';
import {resolveAssignedReport} from '@/lib/placement-service';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
  const token=new URL(request.url).searchParams.get('ticket')??'';if(!/^[a-f0-9]{64}$/.test(token))return new NextResponse('출력 링크가 올바르지 않습니다.',{status:400});
  const {data,error}=await getSupabaseAdmin().rpc('placement_redeem_print',{p_hash:createHash('sha256').update(token).digest('hex')});const row=data?.[0];if(error||!row)return new NextResponse('출력 링크가 만료되었습니다. 반편성관리에서 다시 눌러 주세요.',{status:410});
  const assigned=await resolveAssignedReport(row.report_id,row.workspace_id,row.class_id);if(!assigned.report)return new NextResponse(assigned.reason??'반배정을 확인해 주세요.',{status:409});
  const response=NextResponse.redirect(new URL(`/placement/print/${row.report_id}?workspace=${row.workspace_id}&class=${encodeURIComponent(row.class_id)}`,request.url));
  response.cookies.set(PRINT_COOKIE,signPrintScope({reportId:row.report_id,workspaceId:row.workspace_id,classId:row.class_id,expires:Date.now()+10*60000}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/placement/print',maxAge:600});response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
}
