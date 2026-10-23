import {z} from 'zod';
export const PaperQuestionSchema=z.object({no:z.number().int(),stem:z.string(),passage:z.string(),choices:z.array(z.string()),explanation:z.string(),unclear:z.boolean()});
export const PaperSchema=z.object({questions:z.array(PaperQuestionSchema)});
export const PAPER_TRANSCRIPTION_RULES='발문뿐 아니라 문항의 [보기] 단어 목록, [조건], 답안의 고정 문구와 빈칸을 빠짐없이 옮기세요. 객관식 choices는 선택지이며 서술형 단어은행과 혼동하지 마세요. 서술형 [보기], [조건], [답안]은 stem 끝에 각각 독립된 줄의 해당 라벨과 원문 내용으로 덧붙이세요. 페이지의 옆 단·아래 박스까지 확인하세요. 공통 지문은 해당 문항 모두에 전체를 복사하세요. 여러 소문항 (a)(b)(c)는 OMR의 별도 답안 번호와 배점에 대응시켜 각각 추출하고 같은 지문·조건을 포함하세요. 문항에서 참조한 보기·조건을 찾지 못하면 내용을 지어내지 말고 unclear=true로 표시하세요.';
export type PaperQuestion=z.infer<typeof PaperQuestionSchema>;
export type CounsellingPaper={path:string;filename:string;status:'draft'|'confirmed';uploadedAt:string;confirmedAt?:string;questions:PaperQuestion[]};
export function missingPaperReferences(q:PaperQuestion){const text=q.stem+'\n'+q.passage;return ['보기','조건'].filter(label=>{if(!q.stem.includes('['+label+']'))return false;if(label==='보기'&&q.choices.some(c=>c.trim()))return false;const section=text.match(new RegExp('(?:^|\\n)\\s*\\['+label+'\\]\\s*[:：]?\\s*([^\\[]+)'));return !section?.[1]?.trim();});}
export function usablePaperQuestions(questions:PaperQuestion[]){return questions.filter(q=>!q.unclear&&!missingPaperReferences(q).length&&!!(q.stem.trim()||q.passage.trim()||q.choices.some(c=>c.trim())));}
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
