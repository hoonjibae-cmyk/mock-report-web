import test from 'node:test';import assert from 'node:assert/strict';
import {strengthEvidenceItems,personalCounsellingPayload,CounsellingEvidenceSchema,savedStudentAnalysis} from '../lib/counselling-ai';
import {counsellingForStudent} from '../lib/counselling-output';
const base={no:1,essay:false,answer:1,marked:1,earned:2,point:2,correct:true,area:'독해-상',content:'추론',difficulty:'',levelRate:50,gradeRate:50,hasDetailedEvidence:true};
test('희소 정답을 우선하되 표본 한 명의 정답률로 난도를 판단하거나 다른 영역 근거를 누락하지 않는다',()=>{
 const items=Array.from({length:10},(_,i)=>({...base,no:i+1,gradeAttempts:10,gradeCorrectRate:80}));
 items.push({...base,no:11,gradeAttempts:20,gradeCorrectRate:20});items.push({...base,no:12,gradeAttempts:1,gradeCorrectRate:0});items.push({...base,no:13,area:'문법-상',gradeAttempts:20,gradeCorrectRate:100});
 const selected=strengthEvidenceItems(items);assert.equal(selected[0].no,11);assert.ok(selected.some(i=>i.no===13));assert.equal(selected.some(i=>i.no===12),false);
 assert.deepEqual(strengthEvidenceItems([{...base,correct:false},{...base,hasDetailedEvidence:false}]),[]);
});
test('강점은 공통 유형 분석과 실제 정답 번호를 연결하고 이전 저장 결과와 호환된다',()=>{
 const evidence=CounsellingEvidenceSchema.parse({examId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',reportId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',score:100,max:100,grade:'중2',levelMean:90,gradeMean:70,areas:[],items:[{...base,gradeAttempts:20,gradeCorrectRate:20,question:null}]});
 const payload=personalCounsellingPayload(evidence,{items:[{no:1,skill:'복수 근거 통합',correctReason:'공통 근거',choiceNotes:[],reviewPoints:[],caution:''}]});
 assert.equal(payload.strengthCandidates[0].skill,'복수 근거 통합');assert.equal(payload.strengthCandidates[0].gradeAttempts,20);assert.equal(payload.commonItems[0].no,1);
 const old={summary:'저장 결과',strengths:[{title:'기존 강점',evidence:'기존 근거'}],weaknesses:[],plan:[],programRecommendations:[]};assert.deepEqual(savedStudentAnalysis({counselling_student_analysis:{state:'ready',result:old}}),old);
 const result=counsellingForStudent({...old,strengths:[{title:'추론',evidence:'근거 통합',questionNos:[1,2,3]}]},new Set([2]),{essayResults:{earned:0,possible:0},items:[{no:1,correct:true,hasDetailedEvidence:true},{no:3,correct:true,hasDetailedEvidence:false}]});assert.deepEqual(result.strengths,[]);
 const valid=counsellingForStudent({...old,strengths:[{title:'추론',evidence:'근거 통합',questionNos:[1]}]},new Set(),{essayResults:{earned:0,possible:0},strengthCandidates:[{no:1}]});assert.deepEqual(valid.strengths[0].questionNos,[1]);
});
