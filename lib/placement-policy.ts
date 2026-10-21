import type {GenericReportData,AreaStat} from '@/lib/omr-report-types';

export const PREFERRED_SCHEDULES=['화목','월수금','미정','상관없음'] as const;
export type PreferredSchedule=(typeof PREFERRED_SCHEDULES)[number];
export function preferredSchedule(value:unknown):PreferredSchedule|null{return PREFERRED_SCHEDULES.includes(value as PreferredSchedule)?value as PreferredSchedule:null;}

/** 답안지 '재원 구분' 칸의 보기 — 판독기(omr/layout.py ENROLLMENT_LABELS)와 같은 순서 */
export const ENROLLMENTS = ["재원생", "신규생"] as const;
export type Enrollment = (typeof ENROLLMENTS)[number];
export function enrollmentOf(value: unknown): Enrollment | null {
  return ENROLLMENTS.includes(value as Enrollment) ? (value as Enrollment) : null;
}

/**
 * 신규생 답안지인가 — 수험번호 칸에 쓴 것이 수험번호가 아니라 전화번호 뒤 4자리다.
 * 표기가 없거나 못 읽은 답안지는 재원생으로 본다(수험번호로 찾는다).
 */
export function isNewStudentScan(scan: { enrollment?: string | null }): boolean {
  return enrollmentOf(scan.enrollment) === "신규생";
}
export type RegistryPlacementStudent={status:string;regularEnrolled?:boolean;examOnly?:boolean;grade?:string};
export function notificationDecision(student:RegistryPlacementStudent|undefined):'send'|'skip'|'hold'{
  if(!student||typeof student.regularEnrolled!=='boolean')return 'hold';
  if(student.status!=='재원')return 'skip';
  return student.regularEnrolled?'skip':'send';
}
export function placementGrade(grade:string,schoolLevel=''):string{
  const full=grade.normalize('NFKC').match(/초6|중[123]|고[123]/)?.[0];if(full)return full;
  const prefix=schoolLevel.startsWith('초')?'초':schoolLevel.startsWith('중')?'중':schoolLevel.startsWith('고')?'고':'';
  const result=`${prefix}${grade.trim()}`;return /^(초6|중[123]|고[123])$/.test(result)?result:'';
}
const round=(n:number)=>Math.round(n*10)/10;
// 평균의 분모는 같은 시험을 본, 현재 배정 반 명단에 남아 있는 학생만이다.
export function applyAssignedClass(report:GenericReportData,peers:GenericReportData[],className:string):GenericReportData{
  const unique=new Map<string,GenericReportData>();
  for(const p of peers)if(p.examId===report.examId&&Number.isFinite(p.score.raw)&&!unique.has(p.student.key))unique.set(p.student.key,p);
  unique.set(report.student.key,report);const list=[...unique.values()],scores=list.map(p=>p.score.raw),mean=scores.reduce((a,b)=>a+b,0)/scores.length;
  const stdev=Math.sqrt(scores.reduce((sum,n)=>sum+(n-mean)**2,0)/scores.length),rank=1+scores.filter(n=>n>report.score.raw).length;
  const stats=(items:AreaStat[],key:'areas'|'contents')=>items.map(stat=>{
    const comparable=list.map(p=>p[key]?.find(a=>a.area===stat.area&&a.possible===stat.possible)).filter((a):a is AreaStat=>!!a&&Number.isFinite(a.earned));
    const earned=comparable.reduce((sum,a)=>sum+a.earned,0)/(comparable.length||1);
    return {...stat,cohortEarned:round(earned),cohortRate:stat.possible?round(earned/stat.possible*100):0};
  });
  const standardScore=stdev?round(20*(report.score.raw-mean)/stdev+100):100;
  const items=report.items.map(item=>{
    const comparable=list.flatMap(p=>p.items.filter(i=>i.no===item.no&&!i.absent&&i.point===item.point));
    const rate=comparable.length?round(comparable.reduce((sum,i)=>sum+(i.essay?(i.point?i.earned/i.point:0):Number(i.correct)),0)/comparable.length*100):0;
    return {...item,correctRate:rate,difficulty:item.difficultySpecified?item.difficulty:rate>=80?'쉬움' as const:rate>=50?'보통' as const:'어려움' as const};
  });
  // 지난 회차도 현재 배정 반 응시자들의 실제 점수로 비교한다. 전체 학년 평균을 반 평균으로 표시하지 않는다.
  const growth=report.growth.flatMap(point=>{
    if(point.examId===report.examId)return [{...point,mean:round(mean),standardScore}];
    const values=list.flatMap(p=>p.growth.filter(g=>g.examId===point.examId&&Number.isFinite(g.raw)).slice(0,1).map(g=>g.raw));
    if(!values.length)return [];
    const avg=values.reduce((sum,n)=>sum+n,0)/values.length,sd=Math.sqrt(values.reduce((sum,n)=>sum+(n-avg)**2,0)/values.length);
    return [{...point,mean:round(avg),standardScore:sd?round(20*(point.raw-avg)/sd+100):100}];
  });
  return {...report,student:{...report.student,className},cohort:{count:scores.length,mean:round(mean),stdev:round(stdev),max:Math.max(...scores),min:Math.min(...scores)},standardScore,rank,topPercent:round(rank/scores.length*100),areas:stats(report.areas,'areas'),contents:stats(report.contents??[],'contents'),items,weakItems:items.filter(i=>!i.absent&&!i.correct).sort((a,b)=>a.correctRate-b.correctRate).map(i=>i.no),growth};
}

/** Counselling reports include assigned and waiting students without duplicate seats. */
export function reportClassMembers(state:{memberships:Array<{studentId:string;classId:string;excluded?:boolean}>;waitlist?:Array<{studentId:string;classId:string}>}):Array<{studentId:string;classId:string;excluded?:boolean}>{
  return [...state.memberships.filter(m=>!m.excluded),...(state.waitlist??[])];
}
