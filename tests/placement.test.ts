import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDecision,preferredSchedule,placementGrade,applyAssignedClass} from '../lib/placement-policy';
import {signPrintScope,validPrintScope} from '../lib/placement-print';
import {placementSummaryPng,placementSummarySvg,orderedPlacementAreas} from '../lib/placement-summary';
import type {GenericReportData} from '../lib/omr-report-types';
const report=(key:string,raw:number)=>({schemaVersion:2,family:'C_generic',examType:'placement',examTypeLabel:'반배치고사',academy:'검증학원',examId:'same',examTitle:'겨울 반배치고사',examDate:'2026-12-07',student:{key,name:'검증학생',school:'검증중'},score:{raw,objectiveRaw:raw,essayRaw:0,max:100,correctCount:0,wrongCount:0,blankCount:0,totalQuestions:1},cohort:{count:99,mean:50,stdev:20,max:100,min:0},rank:40,topPercent:40,standardScore:100,grade:null,items:[],weakItems:[],essayCount:0,teacherComment:null,generatedAt:'2026-12-07T00:00:00Z',areas:[{area:'독해-상',earned:raw/10,possible:10,rate:raw,cohortEarned:5,cohortRate:50}],contents:[],growth:[{examId:'same',title:'검증',date:'2026-12-07',raw,mean:50,standardScore:100}]} as GenericReportData);
test('정규 재원생은 제외하고 원본에서 신규로 확인된 재원만 알린다; 정보 누락은 보류한다',()=>{
  assert.equal(notificationDecision({status:'재원',regularEnrolled:true}),'skip');
  assert.equal(notificationDecision({status:'재원',regularEnrolled:false}),'send');
  assert.equal(notificationDecision({status:'퇴원',regularEnrolled:false}),'skip');
  assert.equal(notificationDecision({status:'휴원',regularEnrolled:false}),'skip');
  assert.equal(notificationDecision({status:'재원'}),'hold');assert.equal(notificationDecision(undefined),'hold');
  assert.equal(preferredSchedule('월수금'),'월수금');assert.equal(preferredSchedule('월금'),null);assert.equal(placementGrade('3','중학교'),'중3');
});
test('성적표 평균·영역 평균·석차·현재 추이는 같은 시험의 배정 반 인원만으로 계산한다',()=>{
  const target=report('A',90),other=report('B',70),outsider={...report('C',1),examId:'different'};
  const printed=applyAssignedClass(target,[other,outsider],'배정반');
  assert.equal(printed.cohort.count,2);assert.equal(printed.cohort.mean,80);assert.equal(printed.areas[0].cohortEarned,8);assert.equal(printed.areas[0].cohortRate,80);assert.equal(printed.rank,1);assert.equal(printed.standardScore,120);assert.equal(printed.growth[0].mean,80);assert.equal(printed.student.className,'배정반');assert.equal(target.cohort.mean,50);
  assert.equal(applyAssignedClass(target,[],'단독반').cohort.mean,90);
});
test('ClassFit 출력 권한은 유효시간과 지정한 학생·회차·반을 모두 확인한다',()=>{
  process.env.AUTH_SECRET='placement-test-key-not-used-in-production';const scope={reportId:'one',workspaceId:'winter',classId:'class-a'},token=signPrintScope({...scope,expires:Date.now()+60000});
  assert.equal(validPrintScope(token,scope),true);assert.equal(validPrintScope(token,{...scope,reportId:'two'}),false);assert.equal(validPrintScope(token+'x',scope),false);assert.equal(validPrintScope(signPrintScope({...scope,expires:Date.now()-1}),scope),false);
});

test('문항 정답률과 이전 추이도 배정 반으로 비교하고 지정 난이도는 보존한다',()=>{
  const target=report('A',90),other=report('B',70);
  const item={no:1,essay:false,answer:1,marked:1,correct:true,earned:10,point:10,correctRate:99,difficulty:'쉬움' as const,difficultySpecified:false,area:'독해',content:null};
  target.items=[item,{...item,no:2,difficultySpecified:true}];
  other.items=[{...item,marked:2,correct:false,earned:0},{...item,no:2,marked:2,correct:false,earned:0}];
  target.growth.unshift({examId:'past',title:'이전',date:'2026-11-01',raw:80,mean:20,standardScore:100});
  other.growth.unshift({examId:'past',title:'이전',date:'2026-11-01',raw:60,mean:20,standardScore:100});
  const printed=applyAssignedClass(target,[other],'배정반');
  assert.equal(printed.items[0].correctRate,50);assert.equal(printed.items[0].difficulty,'보통');assert.equal(printed.items[1].difficulty,'쉬움');assert.equal(printed.growth[0].mean,70);
});
test('성적 요약은 학생명·점수·영역·선호 요일이 포함된 실제 PNG로 생성된다',()=>{
  const png=placementSummaryPng(report('A',65),'화목');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(png.byteLength>1000);
});

test('슬랙 영역은 독해·문법·서술형·어휘 및 상중하 순서이며 원본과 추가 영역을 보존한다',()=>{
  const names=['어휘','문법-하','독해 - 중','서술형','독해·하','문법(상)','독해_상','문법 중','듣기'];
  const areas=names.map((area,i)=>({...report('A',65).areas[0],area,earned:i}));
  assert.deepEqual(orderedPlacementAreas(areas).map(a=>a.area),['독해_상','독해 - 중','독해·하','문법(상)','문법 중','문법-하','서술형','어휘','듣기']);
  assert.deepEqual(areas.map(a=>a.area),names);
  const data={...report('A',65),areas};
  const svg=placementSummarySvg(data,'월수금');
  const labels=[...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m=>m[1]);
  assert.ok(labels.indexOf('독해')<labels.indexOf('문법'));
  assert.ok(labels.indexOf('문법')<labels.indexOf('서술형'));
  assert.ok(labels.indexOf('서술형')<labels.indexOf('어휘'));
  assert.equal(labels.filter(l=>l==='상').length,2);
  assert.ok(labels.includes('듣기'));assert.ok(labels.includes('월수금'));
});

test('빈 영역·0점·평균 대체 점수·긴 이름·특수문자도 요약 이미지를 생성한다',()=>{
  const data=report('A',0);data.student.name='<가상 & 학생>';data.examTitle='긴 시험 제목 '.repeat(30);
  data.areas[0]={...data.areas[0],earned:0,possible:0,estimated:true};
  const svg=placementSummarySvg(data,'');
  assert.ok(svg.includes('&lt;가상 &amp; 학생&gt;'));assert.ok(svg.includes('0 / 0*'));
  assert.ok(svg.includes('평균 대체 점수'));assert.ok(!svg.includes('NaN'));
  const png=placementSummaryPng({...data,areas:[]},'월수금');
  assert.equal(png.readUInt32BE(16),1000);assert.ok(png.readUInt32BE(20)>400);
});
