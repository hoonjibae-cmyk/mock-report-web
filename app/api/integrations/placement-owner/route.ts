import {timingSafeEqual} from 'node:crypto';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {placementResponsibleEmployee,summaryUrl} from '@/lib/placement-service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// HR-only bridge for existing bot requests and refreshing expired summary image signatures.
// This shared key is never exposed in a browser or sent to another origin.
export async function GET(request:Request){
 const secret=process.env.HR_API_KEY??'';const actual=Buffer.from(request.headers.get('x-api-key')??''),expected=Buffer.from(secret);
 if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:'unauthorized'},{status:401});
 const id=new URL(request.url).searchParams.get('request')??'';
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return Response.json({error:'invalid request'},{status:400});
 const db=getSupabaseAdmin();const result=await db.from('placement_requests').select('requested_by,report_id').eq('image_token',id).maybeSingle();
 if(result.error)return Response.json({error:'lookup failed'},{status:503});
 if(!result.data)return Response.json({error:'not found'},{status:404});
 const report=await db.from('reports').select('student_name').eq('id',result.data.report_id).maybeSingle();
 if(report.error||!report.data)return Response.json({error:'report unavailable'},{status:503});
 return Response.json({studentName:report.data.student_name,requestedBy:result.data.requested_by,responsibleEmpNo:await placementResponsibleEmployee(result.data.requested_by),imageUrl:summaryUrl(id)},{headers:{'Cache-Control':'no-store'}});
}
