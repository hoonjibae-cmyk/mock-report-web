import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authorizeApi} from '@/lib/api-auth';
import {siteBaseUrl} from '@/lib/utils';
import {loadExamGeneratorSource,ImportError} from '@/lib/exam-generator-source';
import {importPlan} from '@/lib/exam-generator-import';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import {getExam} from '@/lib/omr-exams';
import {FIXED_ID_DIGITS} from '@/lib/omr-types';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request) {
  const auth=await authorizeApi('createReports');
  if(auth.response)return auth.response;
  try {
    if(request.headers.get('origin')!==new URL(siteBaseUrl(request.url)).origin)throw new ImportError('허용되지 않은 요청입니다.',403);
    if(!request.headers.get('content-type')?.includes('application/json'))throw new ImportError('JSON 요청이 필요합니다.',415);
    const raw=await request.text();
    if(Buffer.byteLength(raw)>8192)throw new ImportError('요청이 너무 큽니다.',413);
    const input=z.object({token:z.string().min(20).max(4096),action:z.enum(['preview','import']),pointMode:z.enum(['source','equal']).optional()}).parse(JSON.parse(raw));
    const snapshot=await loadExamGeneratorSource(input.token,auth.user);
    if(input.action==='preview')return NextResponse.json({snapshot},{headers:{'Cache-Control':'no-store'}});
    if(!input.pointMode)throw new ImportError('배점 방식을 선택해 주세요.');
    const plan=importPlan(snapshot,input.pointMode);
    // One atomic INSERT includes answers and analysis metadata; the primary key makes retries race-safe.
    const {error}=await getSupabaseAdmin().from('exams').insert({
      id:plan.id,exam_type:'monthly',report_family:'C_generic',title:snapshot.title,subject:'english',
      exam_date:snapshot.examDate||null,num_questions:snapshot.questions.length,num_choices:5,
      id_digits:FIXED_ID_DIGITS,omr_style:'exam',
      omr_config:{per_column:20,subject_label:'영어 영역',essay_count:0,exam_generator:{snapshot,fingerprint:plan.fingerprint,pointMode:input.pointMode}},
      answer_key:plan.answerKey,points:plan.points,question_meta:plan.questionMeta,grade_cuts:[],
      class_names:snapshot.className?[snapshot.className]:[],use_teacher_comment:true,
      created_by_username:auth.user.username,created_by_name:auth.user.displayName,
    });
    if(error&&error.code!=='23505')throw new ImportError('OMR 시험을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
    const exam=await getExam(plan.id);
    const source=exam?.omrConfig.exam_generator as {fingerprint?:string}|undefined;
    if(!exam||source?.fingerprint!==plan.fingerprint)throw new ImportError('연동 시험을 확인하지 못했습니다.',409);
    return NextResponse.json({id:exam.id,url:`/admin/omr/${exam.id}/key`,existing:!!error},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    const status=e instanceof ImportError?e.status:400;
    const error=e instanceof z.ZodError?'연동 데이터 형식을 확인해 주세요.':e instanceof Error?e.message:'연동하지 못했습니다.';
    return NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
  }
}
