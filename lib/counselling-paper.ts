import {z} from 'zod';
export const PaperQuestionSchema=z.object({no:z.number().int(),stem:z.string(),passage:z.string(),choices:z.array(z.string()),explanation:z.string(),unclear:z.boolean()});
export const PaperSchema=z.object({questions:z.array(PaperQuestionSchema)});
export type PaperQuestion=z.infer<typeof PaperQuestionSchema>;
export type CounsellingPaper={path:string;filename:string;status:'draft'|'confirmed';uploadedAt:string;confirmedAt?:string;questions:PaperQuestion[]};
export function usablePaperQuestions(questions:PaperQuestion[]){return questions.filter(q=>!q.unclear&&!!(q.stem.trim()||q.passage.trim()||q.choices.some(c=>c.trim())));}
export function expandPaperSubquestions(questions:PaperQuestion[],objectiveCount:number,max:number){
 const result=questions.map(q=>({...q}));
 for(const q of questions){
  if(q.no<=objectiveCount||q.unclear||q.stem.includes('소문항 ('))continue;
  const labels=[...q.passage.matchAll(/\(([a-z])\)\s*_{3,}/g)].map(m=>m[1]);
  if(labels.length<2||labels.some((label,i)=>label!==String.fromCharCode(97+i))||q.no+labels.length-1>max)continue;
  if(labels.slice(1).some((_,i)=>{const existing=result.find(item=>item.no===q.no+i+1);return existing&&(existing.stem.trim()||existing.passage.trim()||existing.choices.some(c=>c.trim()));}))continue;
  labels.forEach((label,i)=>{const item={...q,no:q.no+i,stem:q.stem+'\n소문항 ('+label+')에 해당하는 답을 쓰시오.',unclear:false},index=result.findIndex(other=>other.no===item.no);if(index>=0)result[index]=item;else result.push(item);});
 }
 return result.sort((a,b)=>a.no-b.no);
}
export function validatePaperQuestions(input:unknown,max:number){const parsed=PaperSchema.safeParse({questions:input});if(!parsed.success)throw Error('문항 번호·발문·지문·보기를 확인해 주세요.');const questions=parsed.data.questions;if(!questions.length||questions.length>max)throw Error('읽은 문항 수를 확인해 주세요.');const seen=new Set<number>();for(const q of questions){if(q.no<1||q.no>max||seen.has(q.no)||q.stem.length>10000||q.passage.length>30000||q.choices.length>10||q.choices.some(c=>c.length>5000)||q.explanation.length>15000)throw Error('문항 번호와 내용을 확인해 주세요.');seen.add(q.no);}return questions.sort((a,b)=>a.no-b.no);}
export function paperFileType(filename:string){return /\.pdf$/i.test(filename)?'application/pdf':/\.png$/i.test(filename)?'image/png':/\.jpe?g$/i.test(filename)?'image/jpeg':null;}
export function paperPathValid(path:string,examId:string){return path.startsWith('counselling-papers/'+examId+'/')&&/^counselling-papers\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(pdf|png|jpg)$/i.test(path);}
