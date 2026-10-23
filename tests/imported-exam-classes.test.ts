import test from 'node:test';
import assert from 'node:assert/strict';
import {canEditImportedClasses,importedExamClassesSchema} from '../lib/imported-exam-classes';
import {updateImportedExamClasses} from '../lib/omr-exams';

const exam={examType:'monthly' as const,createdByUsername:'owner',omrConfig:{exam_generator:{snapshot:{title:'원본 인쇄 제목'}}}};
test('only imported monthly exam owners or admins can repair the roster link',()=>{
  assert.equal(canEditImportedClasses({username:'owner',role:'user'},exam),true);
  assert.equal(canEditImportedClasses({username:'other',role:'user'},exam),false);
  assert.equal(canEditImportedClasses({username:'admin',role:'admin'},exam),true);
  assert.equal(canEditImportedClasses({username:'owner',role:'user'},{...exam,createdByUsername:null}),false);
  assert.equal(canEditImportedClasses({username:'admin',role:'admin'},{...exam,omrConfig:{}}),false);
  assert.equal(canEditImportedClasses({username:'admin',role:'admin'},{...exam,examType:'placement'}),false);
});
test('repair boundary accepts only selected classes and the previous class list, never grading or report updates',()=>{
  const body={classNames:[' M5 화목 L '],previousClassNames:['잘못된 원본 반명']};
  assert.deepEqual(importedExamClassesSchema.parse(body),{classNames:['M5 화목 L'],previousClassNames:['잘못된 원본 반명']});
  assert.equal(importedExamClassesSchema.safeParse({...body,previousClassNames:[]}).success,true);
  for(const value of [{...body,classNames:[]},{...body,classNames:[' ']},{...body,previousClassNames:undefined},{...body,answer_key:{'1':1}},{...body,points:{'1':100}},{...body,review_status:'draft'},{...body,omr_config:{}},{...body,id:'different-exam'}])assert.equal(importedExamClassesSchema.safeParse(value).success,false);
});
test('storage changes class_names in place with a compare-and-set while all grading, scans and reports stay byte-identical',async()=>{
  process.env.SUPABASE_URL='https://qa.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='qa-placeholder';
  const originalFetch=globalThis.fetch;
  const database={exam:{id:'same-id',title:'시험명',class_names:['잘못된 원본 반명'],answer_key:{'1':3},points:{'1':100},question_meta:{'1':{area:'문법'}},omr_config:exam.omrConfig,review_status:'approved'},scans:[{id:'scan',exam_id:'same-id',answers:{'1':3},status:'reviewed'}],reports:[{id:'report',exam_id:'same-id',token:'same-token',score:100,comment:'코멘트',sent_at:'2026-10-23'}]};
  const before=structuredClone(database),calls:Array<{url:URL;patch:Record<string,unknown>}>=[];
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url),patch=await request.json();
    calls.push({url,patch});assert.equal(request.method,'PATCH');assert.equal(url.pathname,'/rest/v1/exams');
    const matches=url.searchParams.get('id')==='eq.'+database.exam.id&&url.searchParams.get('class_names')==='eq.'+JSON.stringify(database.exam.class_names);
    if(matches)Object.assign(database.exam,patch);
    return Response.json(matches?[{id:database.exam.id}]:[]);
  };
  try{
    assert.equal(await updateImportedExamClasses('same-id',['M5 화목 L'],['잘못된 원본 반명']),true);
    assert.deepEqual(calls[0].patch,{class_names:['M5 화목 L']});
    assert.deepEqual(database,{...before,exam:{...before.exam,class_names:['M5 화목 L']}});
    assert.equal(await updateImportedExamClasses('same-id',['M6 화목 H'],['잘못된 원본 반명']),false);
    assert.deepEqual(database.exam.class_names,['M5 화목 L']);assert.deepEqual(database.scans,before.scans);assert.deepEqual(database.reports,before.reports);
  }finally{globalThis.fetch=originalFetch;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;}
});
