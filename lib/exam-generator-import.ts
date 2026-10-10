import {createHash} from 'node:crypto';
import {z} from 'zod';

export const sourceQuestionSchema=z.object({
  number:z.number().int().min(1).max(120),id:z.uuid(),area:z.enum(['듣기','문법','독해']),
  content:z.string().max(50),difficulty:z.enum(['하','중하','중','중상','상']),
  answer:z.number().int().min(1).max(5),points:z.number().min(0).max(100).nullable(),
  stem:z.string().max(12000),body:z.string().max(24000),given:z.string().max(20000),
  choices:z.array(z.string().max(3000)).length(5),explanation:z.string().max(12000),groupId:z.uuid(),
});
export const sourceSnapshotSchema=z.object({
  schemaVersion:z.literal(1),sourceExamId:z.uuid(),sourceVersion:z.number().int().positive(),
  title:z.string().min(1).max(120),grade:z.enum(['초6','중1','중2','중3']),
  className:z.string().max(60),examDate:z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  teacher:z.string().max(60),duration:z.number().int().min(1).max(300).nullable(),
  questions:z.array(sourceQuestionSchema).min(1).max(120),
}).superRefine((v,ctx)=>{
  if(v.questions.some((q,i)=>q.number!==i+1)||new Set(v.questions.map(q=>q.id)).size!==v.questions.length)
    ctx.addIssue({code:'custom',message:'연동 문항 번호가 올바르지 않습니다.'});
});
export type SourceSnapshot=z.infer<typeof sourceSnapshotSchema>;
export type PointMode='source'|'equal';

export function sameRecipient(recipient:{empNo:string;email:string},account:{hr_emp_no?:unknown;email?:unknown}) {
  return typeof account.hr_emp_no==='string'&&account.hr_emp_no===recipient.empNo&&
    typeof account.email==='string'&&account.email.toLowerCase()===recipient.email.toLowerCase();
}
export function importPlan(snapshot:SourceSnapshot,pointMode:PointMode) {
  if(pointMode==='source'&&snapshot.questions.some(q=>q.points===null||q.points<=0))throw new Error('배점이 비어 있거나 0점인 문항이 있습니다. 균등 100점 배점을 선택하거나 원본에 배점을 설정해 주세요.');
  const answerKey:Record<string,number>={},points:Record<string,number>={},questionMeta:Record<string,{area:string;content:string;difficulty:string}>={};
  for(const q of snapshot.questions){
    answerKey[String(q.number)]=q.answer;
    points[String(q.number)]=pointMode==='equal'?100/snapshot.questions.length:q.points!;
    questionMeta[String(q.number)]={area:q.area,content:q.content,difficulty:q.difficulty};
  }
  if(Object.values(points).reduce((n,p)=>n+p,0)<=0)throw new Error('총 배점은 0보다 커야 합니다.');
  // Content identity excludes save version, so saving unchanged drafts does not duplicate a grading exam.
  const {sourceVersion:_version,...content}=snapshot;
  const fingerprint=createHash('sha256').update(JSON.stringify({content,points})).digest('hex');
  const hash=createHash('sha256').update('yussam-exam-omr-v1:'+fingerprint).digest('hex');
  const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  return {id,fingerprint,answerKey,points,questionMeta};
}
