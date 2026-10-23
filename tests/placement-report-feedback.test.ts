import test from 'node:test';import assert from 'node:assert/strict';
import {placementReportFeedback,loadPlacementReportFeedback} from '../lib/placement-report-feedback';
import type {GenericReportData} from '../lib/omr-report-types';
const result={summary:'상담용 요약',position:{grade:'내부 위치 비교'},programRecommendations:[{programId:'internal'}],strengths:[{title:'문맥 근거 연결',evidence:'문장 간 인과관계를 연결했습니다.',questionNos:[26,30]}],weaknesses:[{title:'의문문 구성',analysis:'의문문 어순 구성에서 감점됐습니다.',questionNos:[47]}]};
const report={examType:'placement',student:{enrollment:'신규생'},counselling_student_analysis:{state:'ready',result}};
test('신입생 성적표는 저장된 핵심 강약점만 읽고 위치·프로그램·내부 자료를 포함하지 않는다',()=>{
 const feedback=placementReportFeedback(report,true);assert.deepEqual(feedback,{strengths:result.strengths,weaknesses:result.weaknesses});
 assert.equal(placementReportFeedback(report,false),null);assert.equal(placementReportFeedback({...report,examType:'monthly'},true),null);
 assert.deepEqual(report.counselling_student_analysis.result,result);
});
test('재분석 중·실패 시 이전 완료 결과를 쓰고 미분석·잘못된 저장 자료는 조용히 생략한다',()=>{
 for(const state of ['processing','error'])assert.deepEqual(placementReportFeedback({...report,counselling_student_analysis:{state,previousResult:result}},true),{strengths:result.strengths,weaknesses:result.weaknesses});
 assert.equal(placementReportFeedback({examType:'placement'},true),null);
 assert.equal(placementReportFeedback({...report,counselling_student_analysis:{state:'processing'}},true),null);
 assert.equal(placementReportFeedback({...report,counselling_student_analysis:{state:'ready',result:{strengths:'invalid'}}},true),null);
});
test('시험 당시 신규생 표기는 등록 후에도 유지되며 완료된 결과 조회에 AI 또는 외부 조회가 필요 없다',async()=>{
 assert.deepEqual(await loadPlacementReportFeedback(report as unknown as GenericReportData,{regularEnrolled:true,registryStatus:'active'}),{strengths:result.strengths,weaknesses:result.weaknesses});
 assert.equal(await loadPlacementReportFeedback({...report,student:{enrollment:'재원생'}} as unknown as GenericReportData,{examOnly:true}),null);
 assert.equal(await loadPlacementReportFeedback({examType:'placement'} as GenericReportData),null);
});
