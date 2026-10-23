import test from 'node:test';
import assert from 'node:assert/strict';
import {attachProgramNames} from '../lib/academy-programs';
import {AnalysisSchema,personalCounsellingPayload,CounsellingEvidenceSchema} from '../lib/counselling-ai';
const program={id:'reading',name:'독해 클리닉',description:'문장 구조와 지문 근거 찾기',grades:'중등'};
test('only saved program identifiers are displayed, with canonical program names',()=>{
 const result=attachProgramNames({programRecommendations:[{programId:'invented',focus:'약점',direction:'허구'},{programId:'reading',focus:'근거 찾기',direction:'지문 근거 찾기 훈련으로 보완'}]},[program]);
 assert.equal(result.programRecommendations.length,1);assert.equal(result.programRecommendations[0].programName,'독해 클리닉');
 assert.deepEqual(attachProgramNames({programRecommendations:[{programId:'reading',focus:'',direction:''}]},[]).programRecommendations,[]);
});
test('concise consultation schema limits each category and prevents long-form output',()=>{
 const result={summary:'요약',strengths:[{title:'강점',evidence:'성취 근거'}],weaknesses:[],plan:['학습 방향'],programRecommendations:[]};
 assert.equal(AnalysisSchema.safeParse(result).success,true);
 assert.equal(AnalysisSchema.safeParse({...result,strengths:Array(3).fill(result.strengths[0])}).success,false);
 assert.equal(AnalysisSchema.safeParse({...result,plan:['가'.repeat(121)]}).success,false);
 const evidence=CounsellingEvidenceSchema.parse({examId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',reportId:'d1a5070f-2d02-4b1b-82f3-4dca990205c9',score:79,max:100,grade:'중2',levelMean:null,gradeMean:70,areas:[],items:[]});
 const payload=personalCounsellingPayload(evidence,{items:[]},[program]);assert.equal(payload.grade,'중2');assert.deepEqual(payload.programs,[program]);
 assert.notDeepEqual(payload,personalCounsellingPayload(evidence,{items:[]},[{...program,description:'수업 내용 수정'}]));
});

test('program guidance allows two short sentences connecting educational effect and student benefit',()=>{
 const recommendation={programId:'reading',focus:'상위 독해 근거 파악',direction:'지문을 어휘·구문·요약으로 연결해 정리하는 학습은 글의 구조와 근거를 체계적으로 이해하는 데 도움이 됩니다. 이 학생은 상위 독해에서 근거를 놓친 오답을 바탕으로, 핵심 문장과 선택지의 연결을 연습할 수 있습니다.'};
 const result={summary:'요약',strengths:[],weaknesses:[],plan:[],programRecommendations:[recommendation]};assert.equal(AnalysisSchema.safeParse(result).success,true);assert.equal(AnalysisSchema.safeParse({...result,programRecommendations:[{...recommendation,direction:'가'.repeat(221)}]}).success,false);
});
