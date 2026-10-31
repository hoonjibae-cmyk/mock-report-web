// Source report grades stay immutable. Links open the grade actually used in Classfit.
export function classfitDestinationUrl(workspace:{id:string;state:{students?:Array<{reportId?:string;grade?:string;removed?:boolean}>}},reportId:string){
 const student=workspace.state.students?.find(s=>s.reportId===reportId&&!s.removed);
 const query=new URLSearchParams({workspace:workspace.id});
 if(student?.grade&&['초6','중1','중2','중3','고1','고2','고3'].includes(student.grade))query.set('grade',student.grade);
 return `https://classfit.yussam.com/?${query}`;
}
