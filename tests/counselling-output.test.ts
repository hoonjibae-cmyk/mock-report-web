import test from 'node:test';import assert from 'node:assert/strict';
import {counsellingForStudent,internalReviewText,normalizeCounsellingAreas,directiveDiagnosis} from '../lib/counselling-output';
import {personalCounsellingPayload,CounsellingEvidenceSchema} from '../lib/counselling-ai';
test('uncertain question reasoning is excluded, while actual area scores remain available',()=>{
 const evidence=CounsellingEvidenceSchema.parse({examId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',reportId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',score:79,max:100,levelMean:null,gradeMean:70,areas:[],items:[47,14].map(no=>({no,essay:false,answer:3,marked:4,earned:0,point:2,correct:false,area:'문법',content:'',difficulty:'',levelRate:null,gradeRate:0,question:null}))});
 const payload=personalCounsellingPayload(evidence,{items:[{no:47,skill:'서술형',correctReason:'불확실한 근거',choiceNotes:[],reviewPoints:[],caution:'보기 누락 · 교사 확인'},{no:14,skill:'조동사',correctReason:'조건 표현',choiceNotes:[],reviewPoints:['조동사'],caution:''}]});
 assert.deepEqual(payload.items.map(i=>i.no),[47,14]);assert.equal(payload.items[0].hasDetailedEvidence,false);assert.deepEqual(payload.commonItems.map(i=>i.no),[14]);assert.equal(JSON.stringify(payload).includes('교사 확인'),false);assert.equal(payload.score,79);
});

test('all six essay grading records survive source cautions, without inflating 9/15 to all correct',()=>{
 const items=Array.from({length:6},(_,i)=>({no:46+i,essay:true,answer:null,marked:null,earned:i===0?3:i>2?2:0,point:i<3?3:2,correct:i===0||i>2,area:'서술형',content:'',difficulty:'',levelRate:null,gradeRate:null,question:null}));
 const evidence=CounsellingEvidenceSchema.parse({examId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',reportId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',score:79,max:100,levelMean:null,gradeMean:null,areas:[],items});
 const payload=personalCounsellingPayload(evidence,{items:items.map(i=>({no:i.no,skill:'문장 완성',correctReason:'',choiceNotes:[],reviewPoints:[],caution:i.no<49?'조건 확인':''}))});
 assert.equal(payload.items.length,6);assert.deepEqual(payload.essayResults,{total:6,correct:4,earned:9,possible:15,wrongNos:[47,48]});assert.equal(payload.commonItems.some(i=>i.no===47),false);
});

test('diagnosis uses canonical area names and cannot contain study instructions',()=>{
 assert.equal(normalizeCounsellingAreas('상 난도 독해와 독해 중·하, 상위 문법'),'독해-상과 독해-중·하, 문법-상');
 const result=counsellingForStudent({summary:'상 난도 독해에서 감점이 나타났습니다.',strengths:[],weaknesses:[{title:'상 난도 독해 근거',analysis:'글의 근거를 연결해 복습하세요.',questionNos:[40]}],plan:[],programRecommendations:[]},new Set([40]));
 assert.equal(directiveDiagnosis(result.weaknesses[0].analysis),false);assert.match(result.weaknesses[0].analysis,/40번.*감점/);assert.match(result.weaknesses[0].title,/독해-상/);
});
test('teacher-review and paper-error instructions never become counselling guidance',()=>{
 const result=counsellingForStudent({summary:'문항 오류를 교사 확인하세요.',strengths:[{title:'문법',evidence:'조동사 문항에서 정답을 골랐습니다.'}],weaknesses:[{title:'문법',questionNos:[14],analysis:'시간절에서 현재시제 사용을 복습하세요.'},{title:'서술형',questionNos:[47],analysis:'47·48은 누락된 보기·조건을 교사 확인하세요.'}],plan:['서술형은 교사 확인 후 다시 쓰세요.'],programRecommendations:[{programId:'p',focus:'문항 오류',direction:'담당자에게 검토를 요청하세요.'}]},new Set([14]));
 assert.equal(result.weaknesses.length,1);assert.deepEqual(result.weaknesses[0].questionNos,[14]);assert.equal(result.programRecommendations.length,0);assert.equal(result.strengths.length,1);assert.equal(internalReviewText(JSON.stringify(result)),false);assert.equal(result.plan.length,1);
 assert.equal(internalReviewText('정답 근거 문장을 표시하며 오답 선택지와 대조하세요.'),false);
});

test('partial essay performance cannot be presented as all-correct strength',()=>{
 const result=counsellingForStudent({summary:'결과',strengths:[{title:'기초 서술형 수행',evidence:'확인된 서술형 문항 3개를 모두 맞혔습니다.'}],weaknesses:[],plan:[],programRecommendations:[]},new Set([47,48]),{essayResults:{earned:9,possible:15}});assert.deepEqual(result.strengths,[]);
});

test('essay loss remains visible when a generated diagnosis omits the essay weakness',()=>{
 const result=counsellingForStudent({summary:'성취 요약',strengths:[],weaknesses:[] as Array<{title:string;questionNos:number[];analysis:string}>,plan:[],programRecommendations:[]},new Set([47,48]),{essayResults:{earned:9,possible:15,wrongNos:[47,48]}});
 assert.deepEqual(result.weaknesses[0].questionNos,[47,48]);assert.match(result.weaknesses[0].analysis,/9\/15/);assert.equal(directiveDiagnosis(result.weaknesses[0].analysis),false);
});
