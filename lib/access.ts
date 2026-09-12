export const USER_PERMISSION_KEYS = [
  "viewReports",
  "createReports",
  "manageReports",
  "deleteReports",
  "exportReports",
  "downloadTemplate",
  "viewPlacement",
] as const;

export type UserPermissionKey = (typeof USER_PERMISSION_KEYS)[number];

export interface UserPermissions {
  viewReports: boolean;
  createReports: boolean;
  manageReports: boolean;
  deleteReports: boolean;
  exportReports: boolean;
  downloadTemplate: boolean;
  /**
   * 반배치고사를 볼 수 있는가.
   *
   * 반배치고사는 반을 새로 짜는 자료라 아무나 보면 안 된다. 다른 권한과 달리
   * 기본값이 부서에 따라 다르다 — defaultPermissionsFor 참고. 교수부는 기본으로
   * 닫혀 있고, 계정 관리에서 사람을 골라 연다.
   */
  viewPlacement: boolean;
}

/**
 * 반배치고사를 기본으로 볼 수 있는 부서.
 *
 * 경영지원과 교육운영팀은 반 편성을 하는 쪽이라 본다. 교수부는 편성 결과를
 * 받는 쪽이라 기본으로 닫고, 필요한 사람만 계정 관리에서 연다. 조교팀은 애초에
 * 이 프로그램 계정이 없다(인사 연동 대상 부서가 아니다).
 */
const PLACEMENT_OPEN_DEPARTMENTS = new Set(["경영지원", "교육운영팀"]);

export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  viewReports: true,
  createReports: true,
  manageReports: true,
  deleteReports: true,
  exportReports: true,
  downloadTemplate: true,
  // 부서를 모르면 닫는다 — 열어 두면 새어 나가고, 닫아 두면 요청이 온다
  viewPlacement: false,
};

export const ADMIN_PERMISSIONS: UserPermissions = {
  viewReports: true,
  createReports: true,
  manageReports: true,
  deleteReports: true,
  exportReports: true,
  downloadTemplate: true,
  viewPlacement: true,
};

export const PERMISSION_LABELS: Record<UserPermissionKey, string> = {
  viewReports: "성적표 목록 조회",
  createReports: "엑셀 업로드·성적표 생성",
  manageReports: "링크 활성화·중지·재발급",
  deleteReports: "개별·묶음·전체 삭제",
  exportReports: "링크 CSV 다운로드",
  downloadTemplate: "입력 템플릿 다운로드",
  viewPlacement: "반배치고사 열람",
};

/** 부서를 알 때의 기본 권한 — 인사 연동으로 계정을 만들 때와, 값이 저장되지 않은 계정을 읽을 때 쓴다 */
export function defaultPermissionsFor(department: unknown): UserPermissions {
  const dept = String(department ?? "").trim();
  return { ...DEFAULT_USER_PERMISSIONS, viewPlacement: PLACEMENT_OPEN_DEPARTMENTS.has(dept) };
}

/**
 * 저장된 권한(jsonb)을 빈틈없는 모양으로 만든다.
 *
 * 예전 권한들은 '적혀 있지 않으면 켜짐'이다 — 처음부터 그렇게 굴러왔고, 바꾸면
 * 모든 계정의 권한이 조용히 달라진다. 반배치고사만 다르다: 적혀 있지 않으면
 * fallback(부서 기본값)을 따른다. 그래서 반배치고사 열람을 정한 적 없는 교수부
 * 계정은 닫혀 있고, 교육운영팀 계정은 열려 있다.
 */
export function normalizePermissions(
  value: unknown,
  fallback: UserPermissions = DEFAULT_USER_PERMISSIONS,
): UserPermissions {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    viewReports: source.viewReports !== false,
    createReports: source.createReports !== false,
    manageReports: source.manageReports !== false,
    deleteReports: source.deleteReports !== false,
    exportReports: source.exportReports !== false,
    downloadTemplate: source.downloadTemplate !== false,
    viewPlacement:
      typeof source.viewPlacement === "boolean" ? source.viewPlacement : fallback.viewPlacement,
  };
}
