import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {importPlan,sameRecipient,sourceSnapshotSchema,type SourceSnapshot} from '../lib/exam-generator-import';
function snapshot():SourceSnapshot{return {schemaVersion:1,sourceExamId:randomUUID(),sourceVersion:1,title:'10월 월말평가',grade:'중3',className:'중3 A',examDate:'2026-10-30',teacher:'담임',duration:60,questions:[1,2,3].map((number)=>({number,id:randomUUID(),groupId:randomUUID(),area:number===1?'듣기':number===2?'문법':'독해',content:'유형',difficulty:'중상',answer:number+1,points:2.5,stem:'문항',body:'본문',given:'',choices:['a','b','c','d','e'],explanation:'해설'}))};}
test('same content is idempotent across saves; answer, order or scoring changes create a new grading exam',()=>{
  const s=snapshot(),plan=importPlan(s,'source');
  assert.equal(importPlan({...s,sourceVersion:5},'source').id,plan.id);
  assert.match(plan.id,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  const changed=structuredClone(s);changed.questions[0].answer=5;
  assert.notEqual(importPlan(changed,'source').id,plan.id);
  assert.notEqual(importPlan(s,'equal').id,plan.id);
  changed.questions.reverse();changed.questions.forEach((q,i)=>q.number=i+1);
  assert.notEqual(importPlan(changed,'source').id,plan.id);
  assert.deepEqual(plan.answerKey,{'1':2,'2':3,'3':4});
  assert.deepEqual(plan.points,{'1':2.5,'2':2.5,'3':2.5});
  assert.deepEqual(plan.questionMeta['2'],{area:'문법',content:'유형',difficulty:'중상'});
});
test('missing scores require an explicit equal-points selection, never silently become zero',()=>{
  const s=snapshot();s.questions[0].points=null;
  assert.throws(()=>importPlan(s,'source'),/배점이 비어/);
  const plan=importPlan(s,'equal');
  assert.ok(Math.abs(Object.values(plan.points).reduce((a,b)=>a+b,0)-100)<1e-9);
  s.questions.forEach(q=>q.points=0);assert.throws(()=>importPlan(s,'source'),/0점인 문항/);
});
test('recipient requires the same HR identity and work email, never a matching name or username',()=>{
  const recipient={empNo:'EMP01',email:'teacher@example.com'};
  assert.equal(sameRecipient(recipient,{hr_emp_no:'EMP01',email:'TEACHER@example.com'}),true);
  assert.equal(sameRecipient(recipient,{hr_emp_no:'EMP02',email:'teacher@example.com'}),false);
  assert.equal(sameRecipient(recipient,{hr_emp_no:'EMP01',email:'other@example.com'}),false);
  assert.equal(sameRecipient(recipient,{}),false);
});
test('malformed numbering, IDs, excessive question counts and invalid answers fail the import boundary',()=>{
  const s=snapshot();assert.equal(sourceSnapshotSchema.safeParse(s).success,true);
  const skipped=structuredClone(s);skipped.questions[1].number=9;assert.equal(sourceSnapshotSchema.safeParse(skipped).success,false);
  const duplicate=structuredClone(s);duplicate.questions[1].id=duplicate.questions[0].id;assert.equal(sourceSnapshotSchema.safeParse(duplicate).success,false);
  const wrong=structuredClone(s);wrong.questions[0].answer=0;assert.equal(sourceSnapshotSchema.safeParse(wrong).success,false);
  assert.equal(sourceSnapshotSchema.safeParse({...s,questions:Array.from({length:121},()=>s.questions[0])}).success,false);
});
