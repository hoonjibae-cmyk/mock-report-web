"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AcademyLogo from "@/components/AcademyLogo";
import UserManagement from "@/components/UserManagement";
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL, type AiModelId } from "@/lib/ai-models";
import type { UserPermissions } from "@/lib/access";
import type { AdminReportListItem } from "@/lib/reports";
import { formatMiddleGrade } from "@/lib/utils";

interface AdminReport extends AdminReportListItem {
  url: string;
}

interface CreatedReport {
  id: string;
  studentName: string;
  school: string;
  token: string;
  url: string;
  active: boolean;
  pinRequired: boolean;
  createdAt: string;
}

interface UploadResult {
  ok: boolean;
  batchId: string;
  reportCount: number;
  aiModel: AiModelId;
  warnings: string[];
  reports: CreatedReport[];
}

interface DashboardUser {
  username: string;
  displayName: string;
  role: "admin" | "user";
  permissions: UserPermissions;
}

const MODEL_STORAGE_KEY = "mock-report-ai-model";

export default function AdminDashboard({
  initialReports,
  baseUrl,
  setupError,
  aiEnabled,
  currentUser,
}: {
  initialReports: AdminReportListItem[];
  baseUrl: string;
  setupError?: string;
  aiEnabled: boolean;
  currentUser: DashboardUser;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser.role === "admin";
  const permissions = currentUser.permissions;
  const [reports, setReports] = useState<AdminReport[]>(
    initialReports.map((report) => ({ ...report, url: `${baseUrl}/r/${report.token}` })),
  );
  const [created, setCreated] = useState<CreatedReport[]>([]);
  const [createdBatchId, setCreatedBatchId] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState(setupError ?? "");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState("");
  const [aiModel, setAiModel] = useState<AiModelId>(DEFAULT_AI_MODEL);

  useEffect(() => {
    if (!isAdmin) return;
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (AI_MODEL_OPTIONS.some((option) => option.value === saved)) {
      setAiModel(saved as AiModelId);
    }
  }, [isAdmin]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) =>
      [report.studentName, report.school, report.batchTitle, report.examLabel]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [reports, search]);

  function selectAiModel(value: string) {
    if (!isAdmin) return;
    const matched = AI_MODEL_OPTIONS.find((option) => option.value === value)?.value ?? DEFAULT_AI_MODEL;
    setAiModel(matched);
    window.localStorage.setItem(MODEL_STORAGE_KEY, matched);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissions.createReports) {
      setError("성적표 생성 권한이 없습니다.");
      return;
    }
    setError("");
    setWarnings([]);
    setCreated([]);
    setCreatedBatchId("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const files = fileRef.current?.files;
    if (!files?.length) {
      setError("엑셀 파일을 선택해 주세요.");
      return;
    }

    formData.delete("files");
    [...files].forEach((file) => formData.append("files", file));
    if (isAdmin) formData.set("aiModel", aiModel);
    else formData.delete("aiModel");
    setLoading(true);
    setStatus("엑셀을 분석하고 학생별 성적표를 계산하고 있습니다…");

    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const data = (await response.json()) as UploadResult & { error?: string };
      if (!response.ok) throw new Error(data.error || "성적표 생성에 실패했습니다.");
      setCreated(data.reports);
      setCreatedBatchId(data.batchId);
      setWarnings(data.warnings ?? []);
      setStatus(
        `${data.reportCount}명의 웹리포트 링크를 생성했습니다.${isAdmin && aiEnabled ? ` AI 총평 모델: ${data.aiModel}` : ""}`,
      );
      setReports((current) => [
        ...data.reports.map((report) => ({
          id: report.id,
          batchId: data.batchId,
          batchTitle: String(formData.get("reportTitle") || "성적표"),
          examLabel: String(formData.get("examLabel") || ""),
          token: report.token,
          studentName: report.studentName,
          school: report.school,
          grade: "3",
          active: report.active,
          pinRequired: report.pinRequired,
          viewCount: 0,
          lastViewedAt: null,
          createdAt: report.createdAt,
          createdByName: currentUser.displayName,
          url: report.url,
        })),
        ...current,
      ]);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "성적표 생성에 실패했습니다.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1500);
  }

  async function changeReport(report: AdminReport, action: "activate" | "deactivate" | "regenerate") {
    if (!permissions.manageReports) return setError("링크 관리 권한이 없습니다.");
    setError("");
    try {
      const response = await fetch(`/api/admin/reports/${report.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "변경에 실패했습니다.");

      setReports((current) =>
        current.map((item) => {
          if (item.id !== report.id) return item;
          if (action === "regenerate") return { ...item, token: data.token, url: data.url, active: true };
          return { ...item, active: action === "activate" };
        }),
      );
      if (action === "regenerate") await copyLink(data.url, report.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "변경에 실패했습니다.");
    }
  }

  async function deleteReport(report: AdminReport) {
    if (!permissions.deleteReports) return setError("성적표 삭제 권한이 없습니다.");
    const confirmed = window.confirm(
      `${report.studentName} 학생의 성적표를 완전히 삭제할까요?\n삭제 후 기존 웹링크는 즉시 열리지 않으며 복구할 수 없습니다.`,
    );
    if (!confirmed) return;

    setError("");
    try {
      const response = await fetch(`/api/admin/reports/${report.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "삭제에 실패했습니다.");
      setReports((current) => current.filter((item) => item.id !== report.id));
      const remainingCreated = created.filter((item) => item.id !== report.id);
      setCreated(remainingCreated);
      if (createdBatchId === report.batchId && remainingCreated.length === 0) setCreatedBatchId("");
      setStatus(`${report.studentName} 학생의 성적표와 링크를 삭제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "삭제에 실패했습니다.");
    }
  }

  async function deleteBatch(batchId: string, batchTitle: string) {
    if (!permissions.deleteReports) return setError("성적표 삭제 권한이 없습니다.");
    const count = reports.filter((report) => report.batchId === batchId).length;
    const confirmed = window.confirm(
      `‘${batchTitle}’ 묶음의 성적표 ${count}건을 모두 삭제할까요?\n학생 명단과 모든 기존 링크가 함께 삭제되며 복구할 수 없습니다.`,
    );
    if (!confirmed) return;

    setError("");
    try {
      const response = await fetch(`/api/admin/batches/${batchId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "묶음 삭제에 실패했습니다.");
      setReports((current) => current.filter((report) => report.batchId !== batchId));
      setCreated((current) => current.filter((report) => !data.deletedReportIds?.includes(report.id)));
      if (createdBatchId === batchId) {
        setCreated([]);
        setCreatedBatchId("");
      }
      setStatus(`‘${batchTitle}’ 묶음의 성적표 ${data.deletedCount ?? count}건을 삭제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "묶음 삭제에 실패했습니다.");
    }
  }

  async function deleteAllReports() {
    if (!permissions.deleteReports || !reports.length) return;
    const typed = window.prompt(
      `현재 저장된 성적표 ${reports.length}건과 모든 링크를 완전히 삭제합니다.\n계속하려면 ‘전체삭제’를 입력하세요.`,
    );
    if (typed !== "전체삭제") return;

    setError("");
    try {
      const response = await fetch("/api/admin/reports", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "전체 삭제에 실패했습니다.");
      setReports([]);
      setCreated([]);
      setCreatedBatchId("");
      setStatus(`저장된 성적표와 링크 ${data.deletedCount ?? reports.length}건을 모두 삭제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "전체 삭제에 실패했습니다.");
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="brand-lockup">
          <AcademyLogo />
          <div>
            <strong>목동유쌤영어학원</strong>
            <span>중3 모의고사 웹리포트 · {isAdmin ? "관리자" : "일반 사용자"}</span>
          </div>
        </div>
        <div className="account-summary">
          <div><strong>{currentUser.displayName}</strong><span>{currentUser.username}</span></div>
          <button className="button ghost" onClick={logout}>로그아웃</button>
        </div>
      </header>

      <div className="admin-grid">
        <section className="panel upload-panel">
          <div className="section-heading">
            <div><p className="eyebrow">STEP 1</p><h1>성적 엑셀 업로드</h1></div>
            {permissions.downloadTemplate ? <a className="button secondary" href="/api/admin/template">입력 템플릿 받기</a> : null}
          </div>

          {permissions.createReports ? (
            <>
              <div className="info-box">
                <strong>입력 방식</strong>
                <p>한 파일 안에 ‘국어·수학·영어’ 시트를 두거나, 과목별 파일을 여러 개 선택할 수 있습니다. 문항 칸에는 ①~⑤/숫자 답안 또는 O·X를 입력할 수 있습니다.</p>
              </div>

              <form className="upload-form" onSubmit={upload}>
                <label><span>성적 엑셀 파일</span><input ref={fileRef} type="file" name="files" accept=".xlsx" multiple required /></label>
                <div className="form-row">
                  <label><span>리포트 제목</span><input name="reportTitle" defaultValue="중3 국영수 전국 모의고사 개인 성적표" /></label>
                  <label><span>시험 묶음명</span><input name="examLabel" defaultValue="2026년도" /></label>
                </div>
                {isAdmin ? (
                  <div className="ai-model-setting">
                    <label>
                      <span>AI 총평 모델</span>
                      <select name="aiModel" value={aiModel} onChange={(event) => selectAiModel(event.target.value)} disabled={!aiEnabled}>
                        {AI_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} — {option.note}</option>)}
                      </select>
                    </label>
                    <p>{aiEnabled ? "선택한 모델은 이 브라우저에 저장되며 다음 업로드에도 유지됩니다." : "OPENAI_API_KEY가 없어 규칙 기반 총평으로 생성됩니다."}</p>
                  </div>
                ) : (
                  <div className="info-box compact-info"><strong>AI 총평</strong><p>일반 사용자 업로드는 시스템 기본 모델로 자동 생성됩니다.</p></div>
                )}
                <label className="checkbox-row"><input type="checkbox" name="pinRequired" value="true" defaultChecked /><span>학부모 휴대전화 뒤 4자리로 리포트 보호</span></label>
                <p className="helper-text">OpenAI API 키는 보안을 위해 Vercel 서버 환경변수에만 보관합니다.</p>
                <button className="button primary full" type="submit" disabled={loading || Boolean(setupError)}>{loading ? "성적표 생성 중…" : "학생별 웹리포트 링크 생성"}</button>
              </form>
            </>
          ) : <div className="permission-denied"><strong>성적표 생성 권한이 없습니다.</strong><p>관리자에게 엑셀 업로드·성적표 생성 권한을 요청해 주세요.</p></div>}

          {status ? <p className="status-message">{status}</p> : null}
          {error ? <p className="form-error block">{error}</p> : null}
          {warnings.length ? <div className="warning-box"><strong>확인할 내용</strong><ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div> : null}
        </section>

        <aside className="panel process-panel">
          <p className="eyebrow">자동 처리 항목</p><h2>업로드 후 자동으로 완성됩니다</h2>
          <ol className="process-list">
            <li><span>1</span><div><strong>문항 채점</strong><p>올해 국·수·영 정답과 배점을 적용합니다.</p></div></li>
            <li><span>2</span><div><strong>영역 분석</strong><p>행동·내용·난이도·학년 수준별 성취율을 계산합니다.</p></div></li>
            <li><span>3</span><div><strong>전국·학원 비교</strong><p>등급, 전국 상위 추정%, 학원 평균·순위를 표시합니다.</p></div></li>
            <li><span>4</span><div><strong>AI 총평</strong><p>{isAdmin ? "관리자가 선택한 모델" : "시스템 기본 모델"}로 강점·보완점·학습 계획을 작성합니다.</p></div></li>
            <li><span>5</span><div><strong>개별 링크</strong><p>학부모에게 보낼 반응형 웹리포트 링크를 생성합니다.</p></div></li>
          </ol>
        </aside>
      </div>

      {created.length ? (
        <section className="panel result-panel">
          <div className="section-heading wrap">
            <div><p className="eyebrow">STEP 2</p><h2>방금 생성된 링크</h2></div>
            <div className="toolbar">
              {permissions.exportReports ? <a className="button secondary" href={`/api/admin/export?batchId=${encodeURIComponent(createdBatchId)}`}>CSV 받기</a> : null}
              {permissions.deleteReports ? <button className="button danger" onClick={() => deleteBatch(createdBatchId, reports.find((report) => report.batchId === createdBatchId)?.batchTitle ?? "방금 생성된 성적표")}>이 묶음 삭제</button> : null}
            </div>
          </div>
          <div className="link-cards">
            {created.map((report) => (
              <article className="link-card" key={report.id}>
                <div><strong>{report.studentName}</strong><span>{report.school || "학교 미입력"} · {report.pinRequired ? "PIN 보호" : "PIN 없음"}</span></div>
                <div className="link-actions"><a className="button small ghost" href={report.url} target="_blank" rel="noreferrer">웹 보기</a><a className="button small ghost" href={`${report.url}?layout=a4`} target="_blank" rel="noreferrer">A4 보기</a><button className="button small primary" onClick={() => copyLink(report.url, `new-${report.id}`)}>{copied === `new-${report.id}` ? "복사됨" : "링크 복사"}</button></div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {permissions.viewReports ? (
        <section className="panel reports-panel">
          <div className="section-heading wrap">
            <div><p className="eyebrow">관리</p><h2>생성된 웹리포트</h2><p className="subtle">권한에 따라 링크 관리, 내보내기와 삭제 기능을 사용할 수 있습니다.</p></div>
            <div className="toolbar">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="학생명·학교·시험 검색" />
              {permissions.exportReports ? <a className="button secondary" href="/api/admin/export">전체 CSV</a> : null}
              {permissions.deleteReports ? <button className="button danger" onClick={deleteAllReports} disabled={!reports.length}>전체삭제</button> : null}
            </div>
          </div>

          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>학생</th><th>리포트 묶음</th><th>생성자</th><th>상태</th><th>조회</th><th>링크 관리</th></tr></thead>
              <tbody>
                {visibleReports.map((report) => (
                  <tr key={report.id}>
                    <td><strong>{report.studentName}</strong><span>{report.school || "학교 미입력"} · {formatMiddleGrade(report.grade)}</span></td>
                    <td><strong>{report.batchTitle}</strong><span>{report.examLabel}</span>{permissions.deleteReports ? <button className="inline-delete" onClick={() => deleteBatch(report.batchId, report.batchTitle)}>이 묶음 삭제</button> : null}</td>
                    <td><strong>{report.createdByName || "관리자"}</strong><span>{new Date(report.createdAt).toLocaleDateString("ko-KR")}</span></td>
                    <td><span className={`status-chip ${report.active ? "active" : "inactive"}`}>{report.active ? "활성" : "중지"}</span><span>{report.pinRequired ? "PIN 보호" : "PIN 없음"}</span></td>
                    <td><strong>{report.viewCount}회</strong><span>{report.lastViewedAt ? new Date(report.lastViewedAt).toLocaleString("ko-KR") : "아직 열람 전"}</span></td>
                    <td><div className="row-actions">
                      <a className="button tiny ghost" href={report.url} target="_blank" rel="noreferrer">웹</a>
                      <a className="button tiny ghost" href={`${report.url}?layout=a4`} target="_blank" rel="noreferrer">A4</a>
                      <button className="button tiny secondary" onClick={() => copyLink(report.url, report.id)}>{copied === report.id ? "복사됨" : "복사"}</button>
                      {permissions.manageReports ? <><button className="button tiny ghost" onClick={() => changeReport(report, report.active ? "deactivate" : "activate")}>{report.active ? "중지" : "활성화"}</button><button className="button tiny ghost" onClick={() => changeReport(report, "regenerate")}>새 링크</button></> : null}
                      {permissions.deleteReports ? <button className="button tiny danger" onClick={() => deleteReport(report)}>삭제</button> : null}
                    </div></td>
                  </tr>
                ))}
                {!visibleReports.length ? <tr><td colSpan={6} className="empty-cell">표시할 성적표가 없습니다.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : <section className="panel reports-panel"><div className="permission-denied"><strong>성적표 목록 조회 권한이 없습니다.</strong><p>관리자에게 해당 권한을 요청해 주세요.</p></div></section>}

      {isAdmin ? <UserManagement /> : null}
    </main>
  );
}
