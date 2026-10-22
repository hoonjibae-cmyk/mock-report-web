import {siteBaseUrl} from '@/lib/utils';
import {canRenameImportedExam, importedExamTitleSchema} from '@/lib/imported-exam-title';
import { NextResponse } from "next/server";
import { canDeleteOwned, NOT_OWNER_MESSAGE } from "@/lib/ownership";
import { authorizeApi } from "@/lib/api-auth";
import { deleteExam, renameImportedExam } from "@/lib/omr-exams";
import { getVisibleExam } from "@/lib/exam-access";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("viewReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ exam });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 조회 오류" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApi("deleteReports");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    // 지우는 것은 되돌릴 수 없다 — 만든 사람과 총괄만
    if (!canDeleteOwned(auth.user, exam.createdByUsername)) {
      return NextResponse.json({ error: NOT_OWNER_MESSAGE }, { status: 403 });
    }
    await deleteExam(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "시험 삭제 오류" },
      { status: 500 },
    );
  }
}

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
  const auth=await authorizeApi('createReports');
  if(auth.response)return auth.response;
  try {
    if(request.headers.get('origin')!==new URL(siteBaseUrl(request.url)).origin)return NextResponse.json({error:'허용되지 않은 요청입니다.'},{status:403});
    if(!request.headers.get('content-type')?.includes('application/json'))return NextResponse.json({error:'JSON 요청이 필요합니다.'},{status:415});
    const raw=await request.text();
    if(Buffer.byteLength(raw)>4096)return NextResponse.json({error:'요청이 너무 큽니다.'},{status:413});
    const parsed=importedExamTitleSchema.safeParse(JSON.parse(raw));
    if(!parsed.success)return NextResponse.json({error:'시험 이름을 한 줄, 1~120자로 입력해 주세요.'},{status:400});
    const {id}=await context.params;
    const exam=await getVisibleExam(id);
    if(!exam)return NextResponse.json({error:'시험을 찾을 수 없습니다.'},{status:404});
    if(!canRenameImportedExam(auth.user,exam))return NextResponse.json({error:'연동 시험의 이름은 만든 사람이나 경영지원에서 변경할 수 있습니다.'},{status:403});
    if(!await renameImportedExam(id,parsed.data.title,exam.title))return NextResponse.json({error:'다른 창에서 시험 이름이 바뀌었습니다. 새로고침 후 다시 확인해 주세요.'},{status:409});
    return NextResponse.json({title:parsed.data.title},{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    return NextResponse.json({error:e instanceof SyntaxError?'요청 형식을 확인해 주세요.':e instanceof Error?e.message:'이름을 저장하지 못했습니다.'},{status:e instanceof SyntaxError?400:500});
  }
}
