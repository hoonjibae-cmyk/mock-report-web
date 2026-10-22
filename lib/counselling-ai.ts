import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import OpenAI from 'openai';
import {zodTextFormat} from 'openai/helpers/zod';
import {z} from 'zod';
import {DEFAULT_AI_MODEL} from '@/lib/ai-models';
import {ensureCommonItemAnalysis,readyCommonAnalysis,commonFingerprint,type CommonAnalysis} from '@/lib/common-item-analysis';
import {sharedAnalysis} from '@/lib/analysis-cache';
import {databaseAnalysisStore} from '@/lib/analysis-store';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
export const CounsellingEvidenceSchema=z.object({examId:z.string().uuid(),reportId:z.string().uuid(),score:z.number(),max:z.number(),levelMean:z.number().nullable(),gradeMean:z.number().nullable(),areas:z.array(z.object({name:z.string(),earned:z.number(),possible:z.number(),rate:z.number(),estimated:z.boolean(),levelMean:z.number().nullable(),gradeMean:z.number().nullable()})).max(40),items:z.array(z.object({no:z.number().int(),essay:z.boolean(),answer:z.union([z.number(),z.array(z.number()),z.null()]),marked:z.union([z.number(),z.array(z.number()),z.null()]),earned:z.number(),point:z.number(),correct:z.boolean(),area:z.string(),content:z.string(),difficulty:z.string(),levelRate:z.number().nullable(),gradeRate:z.number().nullable(),question:z.object({no:z.number(),stem:z.string(),passage:z.string(),choices:z.array(z.string()),explanation:z.string()}).passthrough().nullable()})).max(200)});
const AnalysisSchema=z.object({summary:z.string(),strengths:z.array(z.object({title:z.string(),evidence:z.string(),practice:z.string()})),weaknesses:z.array(z.object({title:z.string(),questionNos:z.array(z.number().int()),analysis:z.string(),practice:z.string()})),plan:z.array(z.string())});
export function verifyCounsellingSignature(body:string,timestamp:string|null,signature:string|null,key:string|undefined,now=Date.now()){
 if(!key||key.length<32||!/^\d{13}$/.test(timestamp??'')||Math.abs(now-Number(timestamp))>90000||! /^[a-f0-9]{64}$/.test(signature??''))return false;
 const expected=createHmac('sha256',key).update('classfit-counselling:v1:'+timestamp+':'+body).digest('hex');return timingSafeEqual(Buffer.from(signature!),Buffer.from(expected));
}
type Evidence=z.infer<typeof CounsellingEvidenceSchema>;
export function personalCounsellingPayload(evidence:Evidence,common:CommonAnalysis){
 const items=evidence.items.map(({question,...result})=>result),wrong=new Set(items.filter(i=>!i.correct).map(i=>i.no));const strengths=items.filter(i=>i.correct).sort((a,b)=>(a.gradeRate??100)-(b.gradeRate??100)).slice(0,6);const needed=new Set([...wrong,...strengths.map(i=>i.no)]);
 return {score:evidence.score,max:evidence.max,levelMean:evidence.levelMean,gradeMean:evidence.gradeMean,areas:evidence.areas,items,commonItems:common.items.filter(i=>needed.has(i.no))};
}
export async function counsellingAnalysis(input:unknown){
 const mode=z.object({mode:z.enum(['read','ensure','regenerate']).default('ensure')}).parse(input).mode;
 const evidence=CounsellingEvidenceSchema.parse(input);if(!evidence.items.length)throw Error('문항별 채점 자료가 없습니다.');
 const {data:report,error}=await getSupabaseAdmin().from('student_reports').select('id,exam_id,is_active,report_data').eq('id',evidence.reportId).single();if(error||!report?.is_active||report.exam_id!==evidence.examId)throw Error('학생 성적이 변경되었습니다. 새로고침해 주세요.');
 let common;
 if(mode==='read'){
  const {data:exam,error:examError}=await getSupabaseAdmin().from('exams').select('omr_config,answer_key,question_meta').eq('id',evidence.examId).single();
  if(examError||!exam)throw Error('시험 문항 분석 자료를 읽지 못했습니다.');
  const analysis=readyCommonAnalysis(exam.omr_config??{},exam.answer_key,exam.question_meta);
  if(!analysis)return null;
  common={analysis,fingerprint:commonFingerprint(exam.omr_config,exam.answer_key,exam.question_meta)};
 }else common=await ensureCommonItemAnalysis(evidence.examId);
 const payload=personalCounsellingPayload(evidence,common.analysis);const fingerprint=createHash('sha256').update(JSON.stringify({version:2,model:DEFAULT_AI_MODEL,common:common.fingerprint,payload})).digest('hex');
 if(mode==='read'){const entry=report.report_data?.counselling_student_analysis;const cached=AnalysisSchema.safeParse(entry?.result);return entry?.state==='ready'&&entry.fingerprint===fingerprint&&cached.success?cached.data:null;}
 return AnalysisSchema.parse(await sharedAnalysis(databaseAnalysisStore('student_reports',evidence.reportId,'report_data'),'counselling_student_analysis',fingerprint,async()=>{
  if(!process.env.OPENAI_API_KEY)throw Error('OMR 리포트의 AI API 설정을 확인해 주세요.');const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:65000,maxRetries:0});const response=await client.responses.parse({model:DEFAULT_AI_MODEL,max_output_tokens:6500,store:false,input:[{role:'system',content:'당신은 영어학원 상담을 돕는 교사입니다. commonItems는 시험별로 한 번 분석해 저장한 공통 문항 분석입니다. 문항 원문은 다시 제공하지 않습니다. 문제 풀이와 선지 분석을 새로 수행하지 말고 commonItems의 정답 근거와 보기별 설명을 그대로 근거로 사용해 학생 결과에 맞춰 정리하세요. 학생이 선택한 오답의 choiceNotes를 연결해 무엇을 복습할지 설명하세요. 공통 분석이 없는 번호는 원문 확인 필요와 영역 성취만 안내하고 지문이나 선택지를 지어내지 마세요. 문항 공통 분석의 caution에 교사 확인이 필요하면 그대로 안내하세요. summary는 짧은 종합진단, strengths는 맞힌 문항과 영역 성취 근거 1~3개, weaknesses는 틀린 문항을 유형별로 묶어 1~5개, plan은 2~4개 학습 활동입니다. 각 weakness에 실제 오답 번호와 공통 분석에 근거한 보완점을 쓰세요. 학생이 왜 오답을 골랐는지 인지 원인·태도·지능을 단정하지 마세요. 서술형은 작성 답안이 없으므로 학생 문장을 추측하지 마세요. 정답 번호는 weaknesses의 questionNos에 넣지 마세요. 약점이 없으면 weaknesses는 빈 배열입니다. 한국어로 작성하세요.'},{role:'user',content:JSON.stringify(payload)}],text:{format:zodTextFormat(AnalysisSchema,'counselling_analysis')}});const analysis=response.output_parsed;if(!analysis)throw Error('AI 분석을 만들지 못했습니다.');const wrong=new Set(evidence.items.filter(i=>!i.correct).map(i=>i.no));analysis.weaknesses=analysis.weaknesses.map(w=>({...w,questionNos:[...new Set(w.questionNos)].filter(no=>wrong.has(no))})).filter(w=>w.questionNos.length);return analysis;
 },{refresh:mode==='regenerate',leaseMs:180000,waitMs:75000}));
}
