"use client";

import { useMemo, useState } from "react";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import FilterBar, { type FilterGroup } from "@/components/FilterBar";
import { EXAM_TYPE_LABELS, type ExamType } from "@/lib/omr-types";
import type { UserPermissions } from "@/lib/access";
import type { AdminReportListItem } from "@/lib/reports";
import { formatMiddleGrade } from "@/lib/utils";

interface AdminReport extends AdminReportListItem {
  url: string;
}

interface Props {
  initialReports: AdminReportListItem[];
  /** 좌측 하위 메뉴에서 고른 시험 유형(없으면 전체) */
  activeType: ExamType | null;
  baseUrl: string;
  setupError?: string;
  currentUser: NavUser & { permissions: UserPermissions };
}

export default function ReportsManager({
  initialReports,
  activeType,
  baseUrl,
  setupError,
  currentUser,
}: Props) {
  const permissions = currentUser.permissions;
  const [reports, setReports] = useState<AdminReport[]>(
    initialReports.map((report) => ({ ...report, url: `${baseUrl}/r/${report.token}` })),
  );
  const [error, setError] = useState(setupError ?? "");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  // 필터는 그룹마다 복수 선택, 그룹끼리는 AND
  const [batchFilter, setBatchFilter] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("recent");
  const [copied, setCopied] = useState("");

  // 좌측 하위 메뉴에서 고른 유형이 먼저 걸리고, 그 안에서 필터가 다시 좁힌다
  const typeReports = useMemo(
    () => (activeType ? reports.filter((r) => r.examType === activeType) : reports),
    [reports, activeType],
  );

  const batchLabel = (report: AdminReport) =>
    [report.batchTitle, report.examLabel].filter(Boolean).join(" · ") || "제목 없음";

  // 시험 필터 항목 — 같은 제목·묶음명은 업로드가 여러 번이어도 하나로 묶는다. 최신순.
  const batches = useMemo(() => {
    const map = new Map<string, { label: string; createdAt: string; count: number }>();
    for (const report of typeReports) {
      const label = batchLabel(report);
      const existing = map.get(label);
      if (!existing) map.set(label, { label, createdAt: report.createdAt, count: 1 });
      else {
        existing.count += 1;
        if (existing.createdAt < report.createdAt) existing.createdAt = report.createdAt;
      }
    }
    return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [typeReports]);

  const authorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of typeReports) {
      const name = report.createdByName?.trim() || "관리자";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [typeReports]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reports) counts.set(r.examType, (counts.get(r.examType) ?? 0) + 1);
    return (Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((key) => ({
      value: key,
      label: EXAM_TYPE_LABELS[key],
      count: counts.get(key) ?? 0,
    }));
  }, [reports]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = typeReports.filter((report) => {
      if (types.length > 0 && !types.includes(report.examType)) return false;
      if (batchFilter.length > 0 && !batchFilter.includes(batchLabel(report))) return false;
      if (authors.length > 0 && !authors.includes(report.createdByName?.trim() || "관리자")) {
        return false;
      }
      if (statuses.length > 0 && !statuses.includes(report.active ? "active" : "inactive")) {
        return false;
      }
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

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.createdAt.localeCompare(b.createdAt);
        case "student":
          return a.studentName.localeCompare(b.studentName, "ko");
        case "views":
          return b.viewCount - a.viewCount;
        case "author":
          return (a.createdByName ?? "").localeCompare(b.createdByName ?? "", "ko");
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
    return sorted;
  }, [typeReports, types, search, batchFilter, authors, statuses, dateFrom, dateTo, sort]);

  const filtering = Boolean(
    search.trim() ||
      batchFilter.length ||
      authors.length ||
      statuses.length ||
      types.length ||
      dateFrom ||
      dateTo,
  );

  const filterGroups: FilterGroup[] = [
    // 좌측 메뉴에서 이미 유형을 골랐다면 유형 필터는 숨긴다(중복)
    ...(activeType
      ? []
      : [{ key: "type", label: "유형", options: typeOptions, selected: types, onChange: setTypes }]),
    {
      key: "batch",
      label: "시험",
      options: batches.map((b) => ({ value: b.label, label: b.label, count: b.count })),
      selected: batchFilter,
      onChange: setBatchFilter,
    },
    { key: "author", label: "만든 사람", options: authorOptions, selected: authors, onChange: setAuthors },
    {
      key: "status",
      label: "상태",
      options: [
        { value: "active", label: "활성", count: typeReports.filter((r) => r.active).length },
        { value: "inactive", label: "중지", count: typeReports.filter((r) => !r.active).length },
      ],
      selected: statuses,
      onChange: setStatuses,
    },
  ];

  function resetFilters() {
    setSearch("");
    setBatchFilter([]);
    setAuthors([]);
    setStatuses([]);
    setTypes([]);
    setDateFrom("");
    setDateTo("");
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
              <h2>{activeType ? EXAM_TYPE_LABELS[activeType] : "생성된 웹리포트"}</h2>
              <p className="subtle">
                {filtering
                  ? `${visibleReports.length}건 표시 중 (전체 ${typeReports.length}건)`
                  : `전체 ${typeReports.length}건`}
                {" · "}권한에 따라 링크 관리, 내보내기와 삭제 기능을 사용할 수 있습니다.
              </p>
            </div>
            <div className="toolbar">
              {permissions.exportReports ? <a className="button secondary" href="/api/admin/export">전체 CSV</a> : null}
              {permissions.deleteReports ? <button className="button danger" onClick={deleteAllReports} disabled={!reports.length}>전체삭제</button> : null}
            </div>
          </div>

          {typeReports.length > 0 ? (
            <>
              <FilterBar
                groups={filterGroups}
                sort={{
                  value: sort,
                  onChange: setSort,
                  options: [
                    { value: "recent", label: "생성일 ↓" },
                    { value: "oldest", label: "생성일 ↑" },
                    { value: "student", label: "학생 이름" },
                    { value: "views", label: "조회 많은 순" },
                    { value: "author", label: "만든 사람" },
                  ],
                }}
                search={{ value: search, onChange: setSearch, placeholder: "학생명·학교·시험 검색" }}
                resultLabel={`${visibleReports.length} / ${typeReports.length}건`}
                onReset={resetFilters}
              />
              <div className="date-range">
                <span className="filter-label">생성일</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span>~</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          ) : null}

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
