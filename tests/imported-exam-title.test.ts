import test from 'node:test';
import assert from 'node:assert/strict';
import {canRenameImportedExam,importedExamTitleSchema,importedPrintTitle} from '../lib/imported-exam-title';
import {renameImportedExam} from '../lib/omr-exams';

const exam={createdByUsername:'owner',omrConfig:{exam_generator:{snapshot:{title:'원본 인쇄 제목'}}}};
test('rename is limited to the imported exam owner or admin; unknown owners stay admin-only',()=>{
  assert.equal(canRenameImportedExam({role:'user',username:'owner'},exam),true);
  assert.equal(canRenameImportedExam({role:'user',username:'other'},exam),false);
  assert.equal(canRenameImportedExam({role:'admin',username:'admin'},exam),true);
  assert.equal(canRenameImportedExam({role:'user',username:'owner'},{...exam,createdByUsername:null}),false);
  assert.equal(canRenameImportedExam({role:'admin',username:'admin'},{...exam,omrConfig:{}}),false);
  assert.equal(importedPrintTitle({omrConfig:{exam_generator:{snapshot:null}}}),null);
});
test('name boundary rejects blank, multiline, excessive or unrelated updates',()=>{
  assert.equal(importedExamTitleSchema.parse({title:'  M7B 화목  '}).title,'M7B 화목');
  for(const value of [{title:' '},{title:'a'.repeat(121)},{title:'a\nb'},{title:'x',answer_key:{}},{title:'x',review_status:'approved'}])assert.equal(importedExamTitleSchema.safeParse(value).success,false);
});
test('storage writes only title with a compare-and-set; source, grading and review cannot be overwritten',async()=>{
  process.env.SUPABASE_URL='https://qa.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='qa-placeholder';
  const originalFetch=globalThis.fetch;
  const calls:Array<{url:string;body:unknown}>=[];
  let rows=[{id:'qa-exam'}];
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init);
    calls.push({url:request.url,body:await request.json()});
    return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    assert.equal(await renameImportedExam('qa-exam','목록 이름','원래 이름'),true);
    assert.deepEqual(calls[0].body,{title:'목록 이름'});
    const url=new URL(calls[0].url);
    assert.equal(url.searchParams.get('id'),'eq.qa-exam');
    assert.equal(url.searchParams.get('title'),'eq.원래 이름');
    rows=[];assert.equal(await renameImportedExam('qa-exam','목록 이름','오래된 이름'),false);
  }finally{globalThis.fetch=originalFetch;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;}
});
