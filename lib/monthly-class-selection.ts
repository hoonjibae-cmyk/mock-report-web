import {homeroomKey} from './homeroom';
import type {ClassOption} from './student-directory';

export interface MonthlyClassSelection {
  classOptions:ClassOption[];
  classesMine:boolean;
  classesError:string|null;
}

/** Use the same directory and homeroom rule for manual creation and Studio imports. */
export function monthlyClassSelection(displayName:string,board:{classes:ClassOption[];error?:string}):MonthlyClassSelection {
  const key=homeroomKey(displayName);
  const mine=key?board.classes.filter(c=>homeroomKey(c.teacher)===key):[];
  const options=mine.length?mine:board.classes;
  return {classOptions:[...new Map(options.map(c=>[c.className,c])).values()].sort((a,b)=>a.className.localeCompare(b.className,'ko')),classesMine:mine.length>0,classesError:board.error??null};
}

/** Never fall back to a free-text class name from an imported exam. */
export function requireMonthlyClasses(names:readonly string[],selection:MonthlyClassSelection):string[] {
  if(selection.classesError||!selection.classOptions.length)throw new Error('반 목록을 확인하지 못했습니다. 잠시 후 반 목록을 다시 불러와 주세요.');
  const unique=[...new Set(names.map(name=>name.trim()).filter(Boolean))].sort();
  if(!unique.length||unique.length>30)throw new Error('시험을 치르는 반을 1~30개 선택해 주세요.');
  const allowed=new Set(selection.classOptions.map(c=>c.className));
  if(unique.some(name=>!allowed.has(name)))throw new Error('선택한 반이 현재 반 목록과 다릅니다. 반 목록을 다시 불러와 선택해 주세요.');
  return unique;
}
