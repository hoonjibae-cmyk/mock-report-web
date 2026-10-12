"use client";

import { useRouter } from "next/navigation";
import { sameTeacher } from "@/lib/homeroom";

/**
 * 총괄이 '내 반'에서 볼 선생님을 고르는 드롭다운.
 *
 * 고르면 주소(?teacher=이름)로 옮겨 가고, 페이지가 그 선생님 반을 다시 그린다.
 * 본인을 고르면 주소를 깨끗이 둔다. 누가 볼 수 있는지는 페이지(서버)가 정한다 —
 * 일반 계정은 주소에 이름을 적어도 제 반만 보인다.
 */
export default function TeacherPicker({
  teachers,
  current,
  self,
}: {
  /** 고를 수 있는 선생님 — 성적표에 담임으로 적힌 이름들(본인 포함) */
  teachers: string[];
  /** 지금 보고 있는 선생님 */
  current: string;
  /** 로그인한 본인 */
  self: string;
}) {
  const router = useRouter();
  // 주소로 직접 들어온 이름이 목록에 없어도 고른 값으로 보인다
  const options = teachers.some((t) => sameTeacher(t, current)) ? teachers : [current, ...teachers];
  const value = options.find((t) => sameTeacher(t, current)) ?? current;

  return (
    <label className="teacher-picker">
      <span>선생님 고르기</span>
      <select
        value={value}
        aria-label="볼 선생님"
        onChange={(e) => {
          const next = e.target.value;
          router.push(sameTeacher(next, self) ? "/admin/my-class" : `/admin/my-class?teacher=${encodeURIComponent(next)}`);
        }}
      >
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
            {sameTeacher(t, self) ? " (나)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
