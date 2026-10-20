import {NextResponse} from 'next/server';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {validSummarySignature} from '@/lib/placement-service';
import {placementSummaryPng} from '@/lib/placement-summary';
import {isGenericReport} from '@/lib/omr-report-types';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params,url=new URL(request.url);
  if(!/^[a-f0-9-]{36}$/.test(token)||!validSummarySignature(token,Number(url.searchParams.get('expires')),url.searchParams.get('signature')??''))return new NextResponse('Not found',{status:404});
  const client=getSupabaseAdmin(),{data:row}=await client.from('placement_requests').select('report_id,preferred_schedule').eq('image_token',token).maybeSingle();if(!row)return new NextResponse('Not found',{status:404});
  const {data:report}=await client.from('student_reports').select('report_data,is_active').eq('id',row.report_id).maybeSingle();if(!report?.is_active||!isGenericReport(report.report_data))return new NextResponse('Not found',{status:404});
  return new NextResponse(new Uint8Array(placementSummaryPng(report.report_data,row.preferred_schedule)),{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
}
