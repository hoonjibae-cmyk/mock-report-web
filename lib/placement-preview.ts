import type {GenericReportData} from '@/lib/omr-report-types';

// 관리자용 가상 알림. 운영 학생·시험·반배정 요청을 만들지 않는다.
export const PLACEMENT_PREVIEW_TOKEN='00000000-0000-4000-8000-000000000001';
export const PLACEMENT_PREVIEW_SCHEDULE='화목';
export const PLACEMENT_PREVIEW_REPORT:GenericReportData={
  schemaVersion:2,family:'C_generic',examId:'DEMO-PLACEMENT',examType:'placement',examTypeLabel:'반배치고사',academy:'목동유쌤영어학원',examTitle:'겨울 반배치고사 · 테스트 가상 자료',examDate:'2026-10-20',
  student:{key:'DEMO-PLACEMENT',name:'가상학생',school:'가상중3'},
  score:{raw:65,objectiveRaw:63,essayRaw:2,max:100,correctCount:20,wrongCount:10,blankCount:0,totalQuestions:30},
  cohort:{count:1,mean:65,stdev:0,max:65,min:65},rank:1,topPercent:100,standardScore:100,grade:null,
  items:[],weakItems:[],growth:[],essayCount:1,teacherComment:null,generatedAt:'2026-10-20T00:00:00Z',
  areas:[['독해·상',13,15],['독해·중',9,11],['독해·하',8,8],['문법·상',7,12],['문법·중',4,10],['문법·하',10,10],['서술형',2,14],['어휘',12,20]].map(([area,earned,possible])=>({area:String(area),earned:Number(earned),possible:Number(possible),rate:Number(earned)/Number(possible)*100,cohortEarned:Number(earned),cohortRate:Number(earned)/Number(possible)*100})),
};
