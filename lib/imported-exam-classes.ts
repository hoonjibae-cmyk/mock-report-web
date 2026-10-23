import {z} from 'zod';
import {canRenameImportedExam} from './imported-exam-title';
import type {OmrExam} from './omr-types';

const className=z.string().trim().min(1).max(60);
export const importedExamClassesSchema=z.object({
  classNames:z.array(className).min(1).max(30),
  // Keep the exact order/text read from storage for the compare-and-set.
  previousClassNames:z.array(z.string().max(120)).max(30),
}).strict();

export function canEditImportedClasses(user:{username:string;role:'admin'|'user'},exam:Pick<OmrExam,'examType'|'createdByUsername'|'omrConfig'>):boolean {
  return exam.examType==='monthly'&&canRenameImportedExam(user,exam);
}
