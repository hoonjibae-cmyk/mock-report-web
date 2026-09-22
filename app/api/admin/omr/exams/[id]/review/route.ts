import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getReviewChannel } from "@/lib/app-settings";
import { getVisibleExam } from "@/lib/exam-access";
import { hrConfigured, notifyChannel, notifyStaff } from "@/lib/hr-directory";
import { updateExamReview } from "@/lib/omr-exams";
import { canApproveReview, reviewApprovedText, reviewRequestText, reviewRequired, transition } from "@/lib/review";
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
