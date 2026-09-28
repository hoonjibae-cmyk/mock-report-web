import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getReviewChannel } from "@/lib/app-settings";
import { getVisibleExam } from "@/lib/exam-access";
import { hrConfigured, notifyChannel, notifyStaff } from "@/lib/hr-directory";
import { getExamOverview, parseTeacherComment, saveExamOverview, saveTeacherComment } from "@/lib/omr-comments";
import { updateExamReview } from "@/lib/omr-exams";
import { canApproveReview, reviewApprovedText, reviewRequestText, reviewRequired, transition, type ReviewEdit } from "@/lib/review";
import { countExamStudents } from "@/lib/reports";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { siteBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 운영진 검토 — 담임이 요청하고(request), 운영진이 컨펌한다(approve).
 *
 * 슬랙 알림은 인사 프로그램을 거쳐 나간다(직원 ↔ 슬랙을 아는 곳은 거기뿐이다).
 * 알림이 실패해도 상태는 저장한다 — 화면에서 상태가 보이므로 사람이 말로
 * 전할 수 있지만, 상태가 저장되지 않으면 아무것도 진행되지 않는다. 대신
 * 실패 사유를 응답에 실어 화면이 그대로 보여 준다.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "approve" ? "approve" : body.action === "request" ? "request" : null;
  if (!action) return NextResponse.json({ error: "action 은 request 또는 approve 여야 합니다." }, { status: 400 });

  // 요청은 성적표를 만드는 사람이면 누구나. 컨펌은 총괄이거나 '월말평가 검토 컨펌'이 켜진 사람(교수부장 등).
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  if (action === "approve" && !canApproveReview(auth.user)) {
    return NextResponse.json(
      { error: "컨펌 권한이 없습니다. 계정 관리에서 '월말평가 검토 컨펌'이 켜진 사람만 컨펌할 수 있습니다." },
      { status: 403 },
    );
  }

  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    if (!reviewRequired(exam.examType)) {
      return NextResponse.json({ error: "이 유형의 시험은 운영진 검토 없이 보낼 수 있습니다." }, { status: 400 });
    }

    const next = transition(exam.review, action, {
      username: auth.user.username,
      displayName: auth.user.displayName,
    });
    if ("error" in next) return NextResponse.json({ error: next.error }, { status: 409 });

    const saved = await updateExamReview(id, next.review);
    const base = siteBaseUrl().replace(/\/$/, "");
    const notices: string[] = [];

    if (action === "request") {
      const channel = await getReviewChannel();
      if (!channel) {
        notices.push("운영진 채널이 설정되어 있지 않아 슬랙 알림은 나가지 않았습니다. 설정 → 시스템 설정에서 채널을 넣어 주세요. 검토 요청 자체는 저장됐습니다.");
      } else if (!hrConfigured()) {
        notices.push("인사 프로그램 연동이 없어 슬랙 알림은 나가지 않았습니다. 검토 요청 자체는 저장됐습니다.");
      } else {
        const studentCount = await countExamStudents(id);
        const result = await notifyChannel(
          channel,
          reviewRequestText({
            examTitle: exam.title,
            requesterName: auth.user.displayName,
            studentCount,
            link: `${base}/admin/omr/${id}/review`,
          }),
        );
        if (!result.delivered) {
          notices.push(`슬랙 운영진 채널 알림을 보내지 못했습니다: ${result.error ?? result.reason ?? "알 수 없는 이유"}. 검토 요청 자체는 저장됐습니다.`);
        }
      }
    } else {
      // 요청한 담임에게 DM — 계정에 적힌 사번으로 인사 프로그램이 슬랙을 찾는다
      const requester = saved.review.requestedBy;
      if (requester && hrConfigured()) {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
          .from("app_users")
          .select("hr_emp_no")
          .eq("username", requester)
          .maybeSingle();
        const empNo = (data?.hr_emp_no as string | null) ?? "";
        if (!empNo) {
          notices.push("요청한 선생님의 계정에 사번이 없어 슬랙 DM은 보내지 못했습니다. 컨펌은 저장됐습니다.");
        } else {
          const result = await notifyStaff(
            empNo,
            reviewApprovedText({
              examTitle: exam.title,
              approverName: auth.user.displayName,
              link: `${base}/admin/omr/${id}/send`,
              // 검수 중 고친 것이 있으면 담임이 슬랙에서 바로 본다
              edits: saved.review.edits,
            }),
          );
          if (!result.delivered) {
            notices.push(`담임 선생님께 슬랙 DM을 보내지 못했습니다: ${result.error ?? result.reason ?? "알 수 없는 이유"}. 컨펌은 저장됐습니다.`);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, review: saved.review, notices });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "검토 처리 오류" },
      { status: 500 },
    );
  }
}

/**
 * 검수자가 그 자리에서 고친다 — 철자·띄어쓰기 같은 사소한 것.
 *
 * 검토 기다리는 중(requested)에만 고칠 수 있다. 컨펌된 뒤 고치면 담임이 모른 채
 * 나가고, 요청 전에 고치면 담임이 아직 쓰는 글을 건드리는 셈이다. 고친 내역은
 * 시험 행에 남겨 컨펌 DM에 실린다. 확정(final)된 글만 고친다 — 초안은 담임이
 * 아직 다듬는 중이다.
 *
 *   PATCH { target: "overview", text } | { target: "student", reportId, text }
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authorizeApi("createReports");
  if (auth.response) return auth.response;
  if (!canApproveReview(auth.user)) {
    return NextResponse.json({ error: "검수 권한이 없습니다. '월말평가 검토 컨펌'이 켜진 사람만 고칠 수 있습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const target = body.target === "overview" ? "overview" : body.target === "student" ? "student" : null;
  const text = String(body.text ?? "").trim();
  const reportId = typeof body.reportId === "string" ? body.reportId : null;
  if (!target || !text) return NextResponse.json({ error: "고칠 대상과 내용이 필요합니다." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "4000자 이하로 써 주세요." }, { status: 400 });
  if (target === "student" && !reportId) return NextResponse.json({ error: "어느 학생인지(reportId)가 없습니다." }, { status: 400 });

  try {
    const exam = await getVisibleExam(id);
    if (!exam) return NextResponse.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    if (exam.review.status !== "requested") {
      return NextResponse.json(
        { error: "검토 기다리는 중일 때만 고칠 수 있습니다. 컨펌된 뒤라면 담임 선생님이 고쳐서 다시 요청해야 합니다." },
        { status: 409 },
      );
    }

    let before = "";
    let studentName: string | null = null;
    if (target === "overview") {
      const overview = await getExamOverview(id);
      if (overview.status !== "final" || !overview.final) {
        return NextResponse.json({ error: "총평이 아직 확정되지 않았습니다. 담임 선생님이 확정한 뒤 고칠 수 있습니다." }, { status: 409 });
      }
      before = overview.final;
      if (before.trim() === text) return NextResponse.json({ error: "바뀐 내용이 없습니다." }, { status: 400 });
      await saveExamOverview(id, { ...overview, final: text });
    } else {
      const supabase = getSupabaseAdmin();
      const { data: row, error } = await supabase
        .from("student_reports")
        .select("id,student_name,teacher_comment,exam_id")
        .eq("id", reportId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row || row.exam_id !== id) return NextResponse.json({ error: "이 시험의 성적표가 아닙니다." }, { status: 404 });
      const comment = parseTeacherComment(row.teacher_comment);
      if (comment.status !== "final" || !comment.personalFinal) {
        return NextResponse.json({ error: "이 학생의 의견은 아직 확정되지 않았습니다. 담임 선생님이 확정한 뒤 고칠 수 있습니다." }, { status: 409 });
      }
      before = comment.personalFinal;
      studentName = (row.student_name as string) ?? null;
      if (before.trim() === text) return NextResponse.json({ error: "바뀐 내용이 없습니다." }, { status: 400 });
      await saveTeacherComment(reportId!, { ...comment, personalFinal: text }, auth.user.displayName);
    }

    const edit: ReviewEdit = {
      target,
      reportId: target === "student" ? reportId : null,
      studentName,
      before,
      after: text,
      editedBy: auth.user.username,
      editedByName: auth.user.displayName,
      at: new Date().toISOString(),
    };
    const saved = await updateExamReview(id, { ...exam.review, edits: [...exam.review.edits, edit] });
    return NextResponse.json({ ok: true, review: saved.review, edit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "수정 저장 오류" }, { status: 500 });
  }
}
