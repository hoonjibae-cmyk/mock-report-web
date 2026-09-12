// 시험을 '보는 사람 기준'으로 연다 — 반배치고사 열람 제한이 걸리는 단 하나의 문.
//
// 화면과 API가 시험을 여는 자리는 스무 곳이 넘는다. 자리마다 "이 사람이 이 유형을
// 볼 수 있는가"를 묻게 두면 한 곳은 반드시 빠진다. 대신 시험을 여는 함수 하나가
// 그 질문을 품는다. 못 보는 시험은 null 이 되어, 이미 있는 "시험을 찾을 수 없습니다"
// 처리로 흘러간다 — 있다는 사실조차 알려 주지 않는다.
//
// omr-exams.ts 와 나눠 둔 이유: 이 파일은 쿠키(next/headers)를 읽는다. 저장소
// 모듈이 그걸 끌어안으면 채점·발송처럼 로그인과 무관한 코드와 테스트까지 Next
// 런타임에 묶인다. lib 안에서 서로 부르는 곳은 getExam 을 그대로 쓴다 — 그쪽은
// 이미 문을 통과한 뒤의 일이다.

import { canViewExamType, getCurrentUser } from "@/lib/auth";
import { getExam } from "@/lib/omr-exams";
import type { OmrExam } from "@/lib/omr-types";

/** 지금 로그인한 사람이 볼 수 있는 시험만 돌려준다 — 못 보는 시험은 '없는 시험'이다 */
export async function getVisibleExam(id: string): Promise<OmrExam | null> {
  const exam = await getExam(id);
  if (!exam) return null;
  const user = await getCurrentUser();
  if (!user || !canViewExamType(user, exam.examType)) return null;
  return exam;
}
