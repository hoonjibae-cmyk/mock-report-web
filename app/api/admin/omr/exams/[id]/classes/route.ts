import {NextResponse} from 'next/server';
import {authorizeApi} from '@/lib/api-auth';
import {getVisibleExam} from '@/lib/exam-access';
import {canEditImportedClasses,importedExamClassesSchema} from '@/lib/imported-exam-classes';
import {monthlyClassSelection,requireMonthlyClasses} from '@/lib/monthly-class-selection';
import {fetchClassBoard} from '@/lib/student-directory';
import {updateImportedExamClasses} from '@/lib/omr-exams';
import {siteBaseUrl} from '@/lib/utils';

export const runtime='nodejs';
export const maxDuration=30;
type Context={params:Promise<{id:string}>};
const noStore={'Cache-Control':'no-store'};

export async function GET(_request:Request,context:Context) {
  const auth=await authorizeApi('createReports');
  if(auth.response)return auth.response;
  try {
    const {id}=await context.params;
    const exam=await getVisibleExam(id);
    if(!exam)return NextResponse.json({error:'시험을 찾을 수 없습니다.'},{status:404});
    if(!canEditImportedClasses(auth.user,exam))return NextResponse.json({error:'연동 월말평가의 응시반은 만든 사람이나 경영지원에서 변경할 수 있습니다.'},{status:403});
    const selection=monthlyClassSelection(auth.user.displayName,await fetchClassBoard());
    return NextResponse.json({classNames:exam.classNames,...selection},{headers:noStore});
  }catch{return NextResponse.json({error:'응시반 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:503,headers:noStore});}
}

export async function PATCH(request:Request,context:Context) {
  const auth=await authorizeApi('createReports');
  if(auth.response)return auth.response;
  try {
    if(request.headers.get('origin')!==new URL(siteBaseUrl(request.url)).origin)return NextResponse.json({error:'허용되지 않은 요청입니다.'},{status:403});
    if(!request.headers.get('content-type')?.includes('application/json'))return NextResponse.json({error:'JSON 요청이 필요합니다.'},{status:415});
    const raw=await request.text();
    if(Buffer.byteLength(raw)>8192)return NextResponse.json({error:'요청이 너무 큽니다.'},{status:413});
    const parsed=importedExamClassesSchema.safeParse(JSON.parse(raw));
    if(!parsed.success)return NextResponse.json({error:'응시반을 선택하고 최신 반 정보를 다시 확인해 주세요.'},{status:400});
    const {id}=await context.params;
    const exam=await getVisibleExam(id);
    if(!exam)return NextResponse.json({error:'시험을 찾을 수 없습니다.'},{status:404});
    if(!canEditImportedClasses(auth.user,exam))return NextResponse.json({error:'연동 월말평가의 응시반은 만든 사람이나 경영지원에서 변경할 수 있습니다.'},{status:403});
    if(JSON.stringify(parsed.data.previousClassNames)!==JSON.stringify(exam.classNames))return NextResponse.json({error:'다른 창에서 응시반이 바뀌었습니다. 반 목록을 다시 불러온 뒤 선택해 주세요.'},{status:409});
    const selection=monthlyClassSelection(auth.user.displayName,await fetchClassBoard());
    let classNames:string[];
    try{classNames=requireMonthlyClasses(parsed.data.classNames,selection);}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'현재 반 목록을 확인해 주세요.'},{status:400});}
    if(!await updateImportedExamClasses(id,classNames,exam.classNames))return NextResponse.json({error:'다른 창에서 응시반이 바뀌었습니다. 반 목록을 다시 불러온 뒤 선택해 주세요.'},{status:409});
    return NextResponse.json({id,classNames},{headers:noStore});
  }catch(e){return NextResponse.json({error:e instanceof SyntaxError?'요청 형식을 확인해 주세요.':'응시반을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:e instanceof SyntaxError?400:503,headers:noStore});}
}
