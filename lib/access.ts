export const USER_PERMISSION_KEYS = [
  "viewReports",
  "createReports",
  "manageReports",
  "deleteReports",
  "exportReports",
  "downloadTemplate",
] as const;

export type UserPermissionKey = (typeof USER_PERMISSION_KEYS)[number];

export interface UserPermissions {
  viewReports: boolean;
  createReports: boolean;
  manageReports: boolean;
  deleteReports: boolean;
  exportReports: boolean;
  downloadTemplate: boolean;
}

export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  viewReports: true,
  createReports: true,
  manageReports: true,
  deleteReports: true,
  exportReports: true,
  downloadTemplate: true,
};

export const ADMIN_PERMISSIONS: UserPermissions = {
  viewReports: true,
  createReports: true,
  manageReports: true,
  deleteReports: true,
  exportReports: true,
  downloadTemplate: true,
};

export const PERMISSION_LABELS: Record<UserPermissionKey, string> = {
  viewReports: "성적표 목록 조회",
  createReports: "엑셀 업로드·성적표 생성",
  manageReports: "링크 활성화·중지·재발급",
  deleteReports: "개별·묶음·전체 삭제",
  exportReports: "링크 CSV 다운로드",
  downloadTemplate: "입력 템플릿 다운로드",
};

export function normalizePermissions(value: unknown): UserPermissions {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    viewReports: source.viewReports !== false,
    createReports: source.createReports !== false,
    manageReports: source.manageReports !== false,
    deleteReports: source.deleteReports !== false,
    exportReports: source.exportReports !== false,
    downloadTemplate: source.downloadTemplate !== false,
  };
}
