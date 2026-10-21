import {z} from 'zod';
export const PaperQuestionSchema=z.object({no:z.number().int(),stem:z.string(),passage:z.string(),choices:z.array(z.string()),explanation:z.string(),unclear:z.boolean()});
export const PaperSchema=z.object({questions:z.array(PaperQuestionSchema)});
export type PaperQuestion=z.infer<typeof PaperQuestionSchema>;
export type CounsellingPaper={path:string;filename:string;status:'draft'|'confirmed';uploadedAt:string;confirmedAt?:string;questions:PaperQuestion[]};
export function validatePaperQuestions(input:unknown,max:number){const parsed=PaperSchema.safeParse({questions:input});if(!parsed.success)throw Error('문항 번호·발문·지문·보기를 확인해 주세요.');const questions=parsed.data.questions;if(!questions.length||questions.length>max)throw Error('읽은 문항 수를 확인해 주세요.');const seen=new Set<number>();for(const q of questions){if(q.no<1||q.no>max||seen.has(q.no)||q.stem.length>10000||q.passage.length>30000||q.choices.length>10||q.choices.some(c=>c.length>5000)||q.explanation.length>15000)throw Error('문항 번호와 내용을 확인해 주세요.');seen.add(q.no);}return questions.sort((a,b)=>a.no-b.no);}
export function paperFileType(filename:string){return /\.pdf$/i.test(filename)?'application/pdf':/\.png$/i.test(filename)?'image/png':/\.jpe?g$/i.test(filename)?'image/jpeg':null;}
export function paperPathValid(path:string,examId:string){return path.startsWith('counselling-papers/'+examId+'/')&&/^counselling-papers\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(pdf|png|jpg)$/i.test(path);}
