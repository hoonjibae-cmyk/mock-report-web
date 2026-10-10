import {z} from 'zod';
import {getSupabaseAdmin} from '@/lib/supabase-admin';
import type {CurrentUser} from '@/lib/auth';
import {sameRecipient,sourceSnapshotSchema} from '@/lib/exam-generator-import';

export class ImportError extends Error {constructor(message:string,public status=400){super(message);}}
export async function loadExamGeneratorSource(token:string,user:CurrentUser) {
  if(!user.id)throw new ImportError('시험지 앱과 동일한 직원의 슬랙 계정으로 로그인해 주세요.',403);
  let response:Response;
  try {
    const local=process.env.NODE_ENV==='development'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.EXAM_GENERATOR_TEST_ORIGIN||'')?process.env.EXAM_GENERATOR_TEST_ORIGIN:'https://exam.yussam.com';
    response=await fetch(`${local}/api/integrations/omr/export`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000),
    });
  }catch{throw new ImportError('시험지 앱에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);}
  if(Number(response.headers.get('content-length'))>3*1024*1024)throw new ImportError('시험 내용이 너무 큽니다.',413);
  const text=await response.text();
  if(Buffer.byteLength(text)>3*1024*1024)throw new ImportError('시험 내용이 너무 큽니다.',413);
  let raw;
  try{raw=JSON.parse(text);}catch{throw new ImportError('시험지 앱의 응답을 확인하지 못했습니다.',503);}
  if(!response.ok)throw new ImportError(typeof raw.error==='string'?raw.error:'시험지를 가져오지 못했습니다.',response.status===401?410:response.status);
  const {snapshot,recipient}=z.object({snapshot:sourceSnapshotSchema,recipient:z.object({empNo:z.string(),email:z.email()})}).parse(raw);
  const {data,error}=await getSupabaseAdmin().from('app_users').select('hr_emp_no,email').eq('id',user.id).maybeSingle();
  if(error)throw new ImportError('직원 정보를 확인하지 못했습니다.',503);
  if(!data||!sameRecipient(recipient,data))throw new ImportError('시험지 앱에서 연동한 직원과 현재 로그인 계정이 다릅니다. 같은 직원 계정으로 로그인해 주세요.',403);
  return snapshot;
}
