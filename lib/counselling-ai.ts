import {STUDENT_COUNSELLING_PROMPT} from '@/lib/counselling-prompt';
import {counsellingForStudent} from '@/lib/counselling-output';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {z} from 'zod';
import {STUDENT_COUNSELLING_MODEL,STUDENT_REASONING_EFFORT} from '@/lib/counselling-models';
import {ensureCommonItemAnalysis,type CommonAnalysis} from '@/lib/common-item-analysis';
import {sharedAnalysis} from '@/lib/analysis-cache';
import {databaseAnalysisStore} from '@/lib/analysis-store';
import {readAcademyPrograms,attachProgramNames,type AcademyProgram} from '@/lib/academy-programs';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
const PositionSchema=z.object({count:z.number().int().nonnegative(),member:z.boolean(),mean:z.number().nullable(),difference:z.number().nullable(),rank:z.number().int().positive().nullable(),tied:z.number().int().nonnegative()});
export const CounsellingEvidenceSchema=z.object({examId:z.string().uuid(),reportId:z.string().uuid(),score:z.number(),max:z.number(),levelName:z.string().max(100).optional(),positions:z.object({grade:PositionSchema,level:PositionSchema}).optional(),grade:z.string().max(20).optional(),levelMean:z.number().nullable(),gradeMean:z.number().nullable(),areas:z.array(z.object({name:z.string(),earned:z.number(),possible:z.number(),rate:z.number(),estimated:z.boolean(),levelMean:z.number().nullable(),gradeMean:z.number().nullable()})).max(40),items:z.array(z.object({no:z.number().int(),essay:z.boolean(),answer:z.union([z.number(),z.array(z.number()),z.null()]),marked:z.union([z.number(),z.array(z.number()),z.null()]),earned:z.number(),point:z.number(),correct:z.boolean(),area:z.string(),content:z.string(),difficulty:z.string(),gradeAttempts:z.number().int().nonnegative().optional(),levelAttempts:z.number().int().nonnegative().optional(),gradeCorrectRate:z.number().nullable().optional(),levelCorrectRate:z.number().nullable().optional(),levelRate:z.number().nullable(),gradeRate:z.number().nullable(),question:z.object({no:z.number(),stem:z.string(),passage:z.string(),choices:z.array(z.string()),explanation:z.string()}).passthrough().nullable()})).max(200)});
export const AnalysisSchema=z.object({summary:z.string().max(120),position:z.object({grade:z.string().max(220),level:z.string().max(220)}).optional(),strengths:z.array(z.object({title:z.string().max(35),evidence:z.string().max(180),questionNos:z.array(z.number().int()).max(4).optional()})).max(3),weaknesses:z.array(z.object({title:z.string().max(35),questionNos:z.array(z.number().int()).max(4),analysis:z.string().max(120)})).max(3),plan:z.array(z.string().max(120)).max(2),programRecommendations:z.array(z.object({programId:z.string().max(80),focus:z.string().max(60),direction:z.string().max(220)})).max(4)});
const GenerationAnalysisSchema=AnalysisSchema.extend({position:AnalysisSchema.shape.position.unwrap(),strengths:z.array(AnalysisSchema.shape.strengths.element.extend({questionNos:z.array(z.number().int()).max(4)})).max(3)});
export function verifyCounsellingSignature(body:string,timestamp:string|null,signature:string|null,key:string|undefined,now=Date.now()){
 if(!key||key.length<32||!/^\d{13}$/.test(timestamp??'')||Math.abs(now-Number(timestamp))>90000||! /^[a-f0-9]{64}$/.test(signature??''))return false;
 const expected=createHmac('sha256',key).update('classfit-counselling:v1:'+timestamp+':'+body).digest('hex');return timingSafeEqual(Buffer.from(signature!),Buffer.from(expected));
}
type Evidence=z.infer<typeof CounsellingEvidenceSchema>;
type ScoredItem=Omit<Evidence['items'][number],'question'>&{hasDetailedEvidence:boolean};
export function strengthEvidenceItems(items:ScoredItem[]){
 const reliableRate=(i:ScoredItem)=>(i.gradeAttempts??0)>=5?i.gradeCorrectRate??i.gradeRate:null;
 const sorted=items.filter(i=>i.correct&&i.hasDetailedEvidence).sort((a,b)=>(reliableRate(a)??101)-(reliableRate(b)??101)||((a.levelAttempts??0)>=5?a.levelCorrectRate??101:101)-((b.levelAttempts??0)>=5?b.levelCorrectRate??101:101)||b.point-a.point);
 const selected=new Map(sorted.slice(0,6).map(i=>[i.no,i]));
 for(const area of new Set(sorted.map(i=>i.area))){const item=sorted.find(i=>i.area===area);if(item)selected.set(item.no,item);}
 return [...selected.values()].slice(0,18);
}
export function usableCommonReasoning(caution:string){
 if(!caution.trim())return true;
 // Capitalisation/punctuation policy does not invalidate the underlying skill or solution.
 return /대소문자|대문자|소문자|문장\s*부호|제목식/u.test(caution)&&!/누락|판독|불명확|불확실|충돌|정답.{0,15}(?:다르|오류|불일치|맞지)|(?:보기|조건|지문).{0,15}(?:없|빠|알 수 없)/u.test(caution);
}
export function personalCounsellingPayload(evidence:Evidence,common:CommonAnalysis,programs:AcademyProgram[]=[]){
 const trusted=new Set(common.items.filter(i=>usableCommonReasoning(i.caution??'')).map(i=>i.no));
 // Grading is authoritative even when a question's detailed source is incomplete.
 const items=evidence.items.map(({question,...result})=>({...result,hasDetailedEvidence:trusted.has(result.no)})),wrong=new Set(items.filter(i=>!i.correct).map(i=>i.no));const strengths=strengthEvidenceItems(items);const needed=new Set([...wrong,...strengths.map(i=>i.no)]);
 const essay=items.filter(i=>i.essay),essayResults={total:essay.length,correct:essay.filter(i=>i.correct).length,earned:essay.reduce((sum,i)=>sum+i.earned,0),possible:essay.reduce((sum,i)=>sum+i.point,0),wrongNos:essay.filter(i=>!i.correct).map(i=>i.no)};
 return {grade:evidence.grade,levelName:evidence.levelName,positions:evidence.positions,strengthCandidates:items.filter(i=>i.correct&&i.hasDetailedEvidence).map(i=>({no:i.no,priority:strengths.some(s=>s.no===i.no),area:i.area,skill:common.items.find(c=>c.no===i.no)?.skill??'',reviewPoints:common.items.find(c=>c.no===i.no)?.reviewPoints??[],gradeCorrectRate:i.gradeCorrectRate,gradeAttempts:i.gradeAttempts,levelCorrectRate:i.levelCorrectRate,levelAttempts:i.levelAttempts})),score:evidence.score,max:evidence.max,levelMean:evidence.levelMean,gradeMean:evidence.gradeMean,areas:evidence.areas,essayResults,programs,items,commonItems:common.items.filter(i=>needed.has(i.no)&&trusted.has(i.no)).map(({caution,...item})=>item)};
}
export function savedStudentAnalysis(document:Record<string,unknown>|null|undefined){
 const entry=document?.counselling_student_analysis as {state?:string;result?:unknown;previousResult?:unknown}|undefined;
 const parsed=AnalysisSchema.safeParse(entry?.state==='ready'?entry.result:entry?.previousResult);
 return parsed.success?parsed.data:null;
}
export async function counsellingAnalysis(input:unknown){
 const mode=z.object({mode:z.enum(['read','ensure','regenerate']).default('ensure')}).parse(input).mode;
 const evidence=CounsellingEvidenceSchema.parse(input);if(!evidence.items.length)throw Error('문항별 채점 자료가 없습니다.');
 const {data:report,error}=await getSupabaseAdmin().from('student_reports').select('id,exam_id,is_active,report_data').eq('id',evidence.reportId).single();if(error||!report?.is_active||report.exam_id!==evidence.examId)throw Error('학생 성적이 변경되었습니다. 새로고침해 주세요.');
 const saved=savedStudentAnalysis(report.report_data);
 if(mode!=='regenerate'&&(saved||mode==='read'))return saved?attachProgramNames(saved,await readAcademyPrograms()):null;
 const common=await ensureCommonItemAnalysis(evidence.examId);
 const programs=await readAcademyPrograms(),payload=personalCounsellingPayload(evidence,common.analysis,programs);const fingerprint=createHash('sha256').update(JSON.stringify({version:9,model:STUDENT_COUNSELLING_MODEL,reasoning:{effort:STUDENT_REASONING_EFFORT},common:common.fingerprint,payload})).digest('hex');
 return attachProgramNames(AnalysisSchema.parse(await sharedAnalysis(databaseAnalysisStore('student_reports',evidence.reportId,'report_data'),'counselling_student_analysis',fingerprint,async()=>{
  if(!process.env.OPENAI_API_KEY)throw Error('OMR 리포트의 AI API 설정을 확인해 주세요.');const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:65000,maxRetries:0});const response=await client.responses.parse({model:STUDENT_COUNSELLING_MODEL,reasoning:{effort:STUDENT_REASONING_EFFORT},max_output_tokens:4500,store:false,input:[{role:'system',content:STUDENT_COUNSELLING_PROMPT},{role:'user',content:JSON.stringify(payload)}],text:{format:zodTextFormat(GenerationAnalysisSchema,'counselling_analysis')}});const analysis=response.output_parsed;if(!analysis)throw Error('AI 분석을 만들지 못했습니다.');const wrong=new Set(payload.items.filter(i=>!i.correct).map(i=>i.no));return counsellingForStudent(analysis,wrong,payload);
 },{refresh:mode==='regenerate',reusePersisted:true,leaseMs:180000,waitMs:75000})),programs);
}
