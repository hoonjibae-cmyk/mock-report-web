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
