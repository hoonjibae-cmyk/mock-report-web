const grades=['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3'];
function kstDate(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):null;}
/** Current school/grade must never be replaced by the promoted placement grade. */
export function placementStudentContext(input:{school?:string;sourceGrade?:string;targetGrade?:string;workspaceTitle?:string;requestedAt:string}){
 const source=String(input.sourceGrade??'').replace(/\s/g,'');
 const grade=grades.includes(source)?source:'';
 let school=String(input.school??'').trim().replace(/\s+/g,' ');
 if(grade){
  // OMR school labels can already include the numeric grade, e.g. "윤슬중 1".
  school=school.replace(new RegExp(`\\s+${grade}(?:학년)?$`),'').replace(new RegExp(`([초중고](?:학교)?)\\s*${grade.slice(-1)}(?:학년)?$`),'$1').trim();
 }
 const current=[school,grade].filter(Boolean).join(' ');
 const winter=String(input.workspaceTitle??'').match(/(20\d{2})\s*겨울학기/);
 const date=kstDate(input.requestedAt),target=input.targetGrade??'';
 const promoted=grade&&grades.indexOf(target)===grades.indexOf(grade)+1;
 return `${current}${winter&&date&&date<`${winter[1]}-01-01`&&promoted?` (예비 ${target})`:''}`;
}
