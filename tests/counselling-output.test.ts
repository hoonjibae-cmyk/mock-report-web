import test from 'node:test';import assert from 'node:assert/strict';
import {counsellingForStudent,internalReviewText} from '../lib/counselling-output';
import {personalCounsellingPayload,CounsellingEvidenceSchema} from '../lib/counselling-ai';
test('uncertain question reasoning is excluded, while actual area scores remain available',()=>{
 const evidence=CounsellingEvidenceSchema.parse({examId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',reportId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',score:79,max:100,levelMean:null,gradeMean:70,areas:[],items:[47,14].map(no=>({no,essay:false,answer:3,marked:4,earned:0,point:2,correct:false,area:'문법',content:'',difficulty:'',levelRate:null,gradeRate:0,question:null}))});
 const payload=personalCounsellingPayload(evidence,{items:[{no:47,skill:'서술형',correctReason:'불확실한 근거',choiceNotes:[],reviewPoints:[],caution:'보기 누락 · 교사 확인'},{no:14,skill:'조동사',correctReason:'조건 표현',choiceNotes:[],reviewPoints:['조동사'],caution:''}]});
 assert.deepEqual(payload.items.map(i=>i.no),[14]);assert.deepEqual(payload.commonItems.map(i=>i.no),[14]);assert.equal(JSON.stringify(payload).includes('교사 확인'),false);assert.equal(payload.score,79);
});
test('teacher-review and paper-error instructions never become counselling guidance',()=>{
 const result=counsellingForStudent({summary:'문항 오류를 교사 확인하세요.',strengths:[{title:'문법',evidence:'조동사 문항에서 정답을 골랐습니다.'}],weaknesses:[{title:'문법',questionNos:[14],analysis:'시간절에서 현재시제 사용을 복습하세요.'},{title:'서술형',questionNos:[47],analysis:'47·48은 누락된 보기·조건을 교사 확인하세요.'}],plan:['서술형은 교사 확인 후 다시 쓰세요.'],programRecommendations:[{programId:'p',focus:'문항 오류',direction:'담당자에게 검토를 요청하세요.'}]},new Set([14]));
 assert.equal(result.weaknesses.length,1);assert.deepEqual(result.weaknesses[0].questionNos,[14]);assert.equal(result.programRecommendations.length,0);assert.equal(result.strengths.length,1);assert.equal(internalReviewText(JSON.stringify(result)),false);assert.equal(result.plan.length,1);
 assert.equal(internalReviewText('정답 근거 문장을 표시하며 오답 선택지와 대조하세요.'),false);
});
