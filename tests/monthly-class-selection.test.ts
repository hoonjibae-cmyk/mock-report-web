import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyClassSelection,requireMonthlyClasses} from '../lib/monthly-class-selection';
import {examImportRequestSchema,importPlan,type SourceSnapshot} from '../lib/exam-generator-import';

const classes=[{className:'M5 화목 L',teacher:'이서영',count:11},{className:'M6 월금 H',teacher:'이승희',count:6},{className:'M5 월금 L',teacher:'이서영',count:8}];
test('manual creation and imported exams share homeroom scoping, with the existing all-class fallback',()=>{
  const mine=monthlyClassSelection('이서영',{classes});
  assert.equal(mine.classesMine,true);
  assert.deepEqual(new Set(mine.classOptions.map(c=>c.className)),new Set(['M5 월금 L','M5 화목 L']));
  const all=monthlyClassSelection('운영진',{classes});
  assert.equal(all.classesMine,false);assert.equal(all.classOptions.length,3);
  assert.equal(monthlyClassSelection('',{classes}).classOptions.length,3);
  assert.deepEqual(classes.map(c=>c.count),[11,6,8]);
});
test('imports require an explicit actual class; source titles, another homeroom and stale names are rejected',()=>{
  const selection=monthlyClassSelection('이서영',{classes});
  for(const names of [[],['M5 10월 월말평가'],['M6 월금 H'],['폐강한 반']])assert.throws(()=>requireMonthlyClasses(names,selection),/반/);
  assert.deepEqual(requireMonthlyClasses([' M5 화목 L ','M5 월금 L','M5 화목 L'],selection),['M5 월금 L','M5 화목 L']);
  assert.throws(()=>requireMonthlyClasses(['M5 화목 L'],monthlyClassSelection('이서영',{classes:[],error:'timeout'})),/다시 불러와/);
  assert.throws(()=>requireMonthlyClasses(['M5 화목 L'],monthlyClassSelection('이서영',{classes:[]})),/다시 불러와/);
  assert.throws(()=>requireMonthlyClasses(['M5 화목 L'],monthlyClassSelection('이서영',{classes,error:'partial failure'})),/다시 불러와/);
});
test('the API boundary rejects old no-class imports, empty classes, malformed names and missing point mode',()=>{
  const token='test-handoff-token-for-regression';
  const valid={action:'import',token,pointMode:'equal',classNames:['M5 화목 L']};
  assert.equal(examImportRequestSchema.safeParse(valid).success,true);
  assert.equal(examImportRequestSchema.safeParse({action:'preview',token}).success,true);
  for(const value of [{...valid,classNames:undefined},{...valid,classNames:[]},{...valid,classNames:[' ']},{...valid,pointMode:undefined},{...valid,classNames:['x'.repeat(61)]},{...valid,classNames:Array(31).fill('M5 화목 L')},{...valid,answer_key:{'1':5}}])assert.equal(examImportRequestSchema.safeParse(value).success,false);
});
test('idempotency includes account and chosen class set, and cannot reuse an old unscoped grading exam',()=>{
  const snapshot:SourceSnapshot={schemaVersion:1,sourceExamId:'00000000-0000-4000-8000-000000000001',sourceVersion:1,title:'M5 10월 월말평가',grade:'중1',className:'자유 입력 반명',examDate:'2026-10-24',teacher:'담임',duration:60,questions:[{number:1,id:'00000000-0000-4000-8000-000000000002',groupId:'00000000-0000-4000-8000-000000000002',area:'문법',content:'어법',difficulty:'중',answer:3,points:100,stem:'문항',body:'본문',given:'',choices:['a','b','c','d','e'],explanation:'해설'}]};
  const original=structuredClone(snapshot);
  const a=importPlan(snapshot,'source',{username:'teacher',classNames:['M5 화목 L','M5 월금 L']});
  assert.equal(importPlan({...snapshot,sourceVersion:9},'source',{username:'teacher',classNames:['M5 월금 L','M5 화목 L','M5 화목 L']}).id,a.id);
  assert.notEqual(importPlan(snapshot,'source',{username:'teacher',classNames:['M5 화목 L']}).id,a.id);
  assert.notEqual(importPlan(snapshot,'source',{username:'other',classNames:['M5 화목 L','M5 월금 L']}).id,a.id);
  assert.throws(()=>importPlan(snapshot,'source',{username:'teacher',classNames:[]}),/응시반/);
  assert.deepEqual(a.answerKey,{'1':3});assert.deepEqual(a.points,{'1':100});assert.deepEqual(snapshot,original);
});
