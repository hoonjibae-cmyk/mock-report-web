import {z} from 'zod';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import type {GenericReportData} from '@/lib/omr-report-types';
const numbers=z.array(z.number().int().positive()).max(4).optional();
const FeedbackSchema=z.object({strengths:z.array(z.object({title:z.string().max(35),evidence:z.string().max(180),questionNos:numbers})).max(3),weaknesses:z.array(z.object({title:z.string().max(35),analysis:z.string().max(120),questionNos:numbers})).max(3)});
export type PlacementReportFeedback=z.infer<typeof FeedbackSchema>;
/** Read only the completed, student-facing highlights, never generate or expose internal notes. */
export function placementReportFeedback(data:unknown,newStudent:boolean):PlacementReportFeedback|null{
 if(!newStudent||!data||typeof data!=='object'||(data as GenericReportData).examType!=='placement')return null;
 const entry=(data as Record<string,unknown>).counselling_student_analysis as {state?:string;result?:unknown;previousResult?:unknown}|undefined;
 const parsed=FeedbackSchema.safeParse(entry?.state==='ready'?entry.result:entry?.previousResult);
 return parsed.success&&(parsed.data.strengths.length||parsed.data.weaknesses.length)?parsed.data:null;
}
export async function loadPlacementReportFeedback(report:GenericReportData,hint?:{examOnly?:boolean;regularEnrolled?:boolean;registryStatus?:string}){
 const feedback=placementReportFeedback(report,true);if(!feedback)return null;
 // New reports retain the enrollment at exam time, even after the student registers.
 let enrollment=report.student.enrollment;
 if(!enrollment){
  const {data}=await getSupabaseAdmin().from('omr_scans').select('enrollment').eq('exam_id',report.examId).eq('student_key',report.student.key).eq('status','reviewed').order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(data?.enrollment==='신규생'||data?.enrollment==='재원생')enrollment=data.enrollment;
 }
 const newcomer=enrollment?enrollment==='신규생':hint?.examOnly===true||hint?.regularEnrolled===false||hint?.registryStatus==='pending';
 return newcomer?feedback:null;
}
