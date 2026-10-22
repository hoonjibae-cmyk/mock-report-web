import {z} from 'zod';
import type {OmrExam} from './omr-types';

export const importedExamTitleSchema=z.object({title:z.string().trim().min(1).max(120).refine(v=>!/[\r\n\u0000-\u001f\u007f]/.test(v),'한 줄로 입력해 주세요.')}).strict();

export function importedPrintTitle(exam:Pick<OmrExam,'omrConfig'>):string|null {
  const source=exam.omrConfig.exam_generator;
  if(!source||typeof source!=='object')return null;
  const snapshot=(source as {snapshot?:unknown}).snapshot;
  if(!snapshot||typeof snapshot!=='object')return null;
  const title=(snapshot as {title?:unknown}).title;
  return typeof title==='string'&&title.trim()?title.trim():null;
}

export function canRenameImportedExam(user:{username:string;role:'admin'|'user'},exam:Pick<OmrExam,'createdByUsername'|'omrConfig'>):boolean {
  return importedPrintTitle(exam)!==null&&(user.role==='admin'||!!exam.createdByUsername&&user.username===exam.createdByUsername);
}
