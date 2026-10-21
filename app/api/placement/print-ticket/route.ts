import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {PRINT_COOKIE,signPrintScope} from '@/lib/placement-print';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
  const query=new URL(request.url).searchParams,preview=query.get('preview')==='1';const token=query.get('ticket')??'';if(!/^[a-f0-9]{64}$/.test(token))return new NextResponse('출력 링크가 올바르지 않습니다.',{status:400});
  const {data,error}=await getSupabaseAdmin().rpc('placement_redeem_print',{p_hash:createHash('sha256').update(token).digest('hex')});const row=data?.[0];if(error||!row)return new NextResponse('출력 링크가 만료되었습니다. 반편성관리에서 다시 눌러 주세요.',{status:410});
  // The destination validates the current class and report once; this route only redeems the scoped ticket.
  const response=NextResponse.redirect(new URL(`/placement/print/${row.report_id}?workspace=${row.workspace_id}&class=${encodeURIComponent(row.class_id)}${preview?'&preview=1':''}`,request.url));
  response.cookies.set(PRINT_COOKIE,signPrintScope({reportId:row.report_id,workspaceId:row.workspace_id,classId:row.class_id,expires:Date.now()+10*60000}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/placement/print',maxAge:600});response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
}
