"use client";

import { useMemo, useState } from "react";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import type { UserPermissions } from "@/lib/access";
import type { AdminReportListItem } from "@/lib/reports";
import { formatMiddleGrade } from "@/lib/utils";

interface AdminReport extends AdminReportListItem {
  url: string;
}

interface Props {
  initialReports: AdminReportListItem[];
  baseUrl: string;
  setupError?: string;
  currentUser: NavUser & { permissions: UserPermissions };
}

export default function ReportsManager({ initialReports, baseUrl, setupError, currentUser }: Props) {
  const permissions = currentUser.permissions;
  const [reports, setReports] = useState<AdminReport[]>(
    initialReports.map((report) => ({ ...report, url: `${baseUrl}/r/${report.token}` })),
  );
  const [error, setError] = useState(setupError ?? "");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [copied, setCopied] = useState("");

  // 시험(리포트 묶음) 필터 항목 — 최신순
  const batches = useMemo(() => {
    const map = new Map<string, { id: string; label: string; createdAt: string }>();
    for (const report of reports) {
      if (!map.has(report.batchId)) {
        map.set(report.batchId, {
          id: report.batchId,
          label: [report.batchTitle, report.examLabel].filter(Boolean).join(" · "),
          createdAt: report.createdAt,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [reports]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (batchFilter && report.batchId !== batchFilter) return false;
      const created = report.createdAt.slice(0, 10);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      if (
        query &&
        ![report.studentName, report.school, report.batchTitle, report.examLabel]
          .join(" ")
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [reports, search, batchFilter, dateFrom, dateTo]);

  const filtering = Boolean(search.trim() || batchFilter || dateFrom || dateTo);

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
      if (batchFilter === batchId) setBatchFilter("");
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
      setStatus(`저장된 성적표와 링크 ${data.deletedCount ?? reports.length}건을 모두 삭제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "전체 삭제에 실패했습니다.");
    }
  }

  return (
    <main className="admin-shell">
      <AdminTopNav user={currentUser} />

      {permissions.viewReports ? (
        <section className="panel reports-panel">
          <div className="section-heading wrap">
            <div>
              <p className="eyebrow">웹 리포트</p>
              <h2>생성된 웹리포트</h2>
              <p className="subtle">
                {filtering
                  ? `${visibleReports.length}건 표시 중 (전체 ${reports.length}건)`
                  : `전체 ${reports.length}건`}
                {" · "}권한에 따라 링크 관리, 내보내기와 삭제 기능을 사용할 수 있습니다.
              </p>
            </div>
            <div className="toolbar">
              {permissions.exportReports ? <a className="button secondary" href="/api/admin/export">전체 CSV</a> : null}
              {permissions.deleteReports ? <button className="button danger" onClick={deleteAllReports} disabled={!reports.length}>전체삭제</button> : null}
            </div>
          </div>

          <div className="toolbar" style={{ flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <label style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>시험(묶음)</span>
              <select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)}>
                <option value="">전체 시험</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>{batch.label || "제목 없음"}</option>
                ))}
              </select>
            </label>
            <label style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>생성일 시작</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>생성일 끝</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <label style={{ margin: 0, flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12 }}>검색</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="학생명·학교·시험 검색" />
            </label>
            {filtering ? (
              <button
                className="button ghost"
                style={{ alignSelf: "flex-end" }}
                onClick={() => { setSearch(""); setBatchFilter(""); setDateFrom(""); setDateTo(""); }}
              >
                필터 해제
              </button>
            ) : null}
          </div>

          {status ? <p className="status-message">{status}</p> : null}
          {error ? <p className="form-error block">{error}</p> : null}

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
                {!visibleReports.length ? <tr><td colSpan={6} className="empty-cell">{filtering ? "조건에 맞는 성적표가 없습니다." : "표시할 성적표가 없습니다."}</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel reports-panel"><div className="permission-denied"><strong>성적표 목록 조회 권한이 없습니다.</strong><p>관리자에게 해당 권한을 요청해 주세요.</p></div></section>
      )}
    </main>
  );
}
