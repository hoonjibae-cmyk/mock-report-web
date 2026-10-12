"use client";

import Link from "next/link";
import { canDeleteOwned, NOT_OWNER_MESSAGE } from "@/lib/ownership";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import FilterBar, { type FilterGroup } from "@/components/FilterBar";
import { hasRange, inRange, rangeLabel, type DateRange } from "@/lib/date-range";
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
  /** 서버가 잘라 온 생성일 기간(주소의 ?from=&to=). 없으면 최근 것부터 */
  range: DateRange;
  /** 상한에 걸려 더 오래된 성적표를 두고 왔는가 */
  truncated: boolean;
  cap: number;
  baseUrl: string;
  setupError?: string;
  currentUser: NavUser & { permissions: UserPermissions };
}

export default function ReportsManager({
  initialReports,
  activeType,
  range,
  truncated,
  cap,
  baseUrl,
  setupError,
  currentUser,
}: Props) {
  const permissions = currentUser.permissions;
  const router = useRouter();
  const withUrl = (items: AdminReportListItem[]): AdminReport[] =>
    items.map((report) => ({ ...report, url: `${baseUrl}/r/${report.token}` }));
  const [reports, setReports] = useState<AdminReport[]>(() => withUrl(initialReports));
  // 생성일 기간을 바꾸면 서버가 새 목록을 내려준다 — 그때 화면의 목록도 바꾼다
  useEffect(() => {
    setReports(initialReports.map((report) => ({ ...report, url: `${baseUrl}/r/${report.token}` })));
  }, [initialReports, baseUrl]);
  const [error, setError] = useState(setupError ?? "");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  // 필터는 그룹마다 복수 선택, 그룹끼리는 AND
  const [batchFilter, setBatchFilter] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  // 알림톡 발송 상태 — "안 보낸 학생만" 추리는 데 쓴다
  const [sendStates, setSendStates] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(range.from ?? "");
  const [dateTo, setDateTo] = useState(range.to ?? "");
  const [sort, setSort] = useState("recent");
  const [copied, setCopied] = useState("");

  /**
   * 생성일 기간은 화면에서 거르는 데서 끝나지 않는다. 서버는 최근 상한까지만
   * 내려주므로, 기간을 주소(?from=&to=)에 실어 그 기간만 다시 가져온다. 달력에서
   * 날짜를 고르는 동안 요청이 연달아 나가지 않게 잠깐 모았다 보낸다.
   */
  const rangeTimer = useRef<number | null>(null);
  function navigateRange(from: string, to: string) {
    const params = new URLSearchParams();
    if (activeType) params.set("type", activeType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    router.replace(`/admin/reports${query ? `?${query}` : ""}`);
  }
  function changeRange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    if (rangeTimer.current) window.clearTimeout(rangeTimer.current);
    rangeTimer.current = window.setTimeout(() => navigateRange(from, to), 400);
  }

  // 좌측 하위 메뉴에서 고른 유형이 먼저 걸리고, 그 안에서 필터가 다시 좁힌다
  const typeReports = useMemo(
    () => (activeType ? reports.filter((r) => r.examType === activeType) : reports),
    [reports, activeType],
  );

  const batchLabel = (report: AdminReport) =>
    [report.batchTitle, report.examLabel].filter(Boolean).join(" · ") || "제목 없음";

  const authorOf = (report: AdminReport) => report.createdByName?.trim() || "관리자";

  // 시험 필터 항목 — 같은 제목·묶음명은 업로드가 여러 번이어도 하나로 묶는다. 최신순.
  const batches = useMemo(() => {
    const map = new Map<
      string,
      { label: string; createdAt: string; count: number; authors: Set<string> }
    >();
    for (const report of typeReports) {
      const label = batchLabel(report);
      const existing = map.get(label);
      if (!existing) {
        map.set(label, {
          label,
          createdAt: report.createdAt,
          count: 1,
          authors: new Set([authorOf(report)]),
        });
      } else {
        existing.count += 1;
        existing.authors.add(authorOf(report));
        if (existing.createdAt < report.createdAt) existing.createdAt = report.createdAt;
      }
    }
    return [...map.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((batch) => {
        // 같은 시험을 두 사람이 나눠 만들었을 수 있다. 이름을 다 늘어놓으면
        // 줄이 넘치므로 첫 사람만 쓰고 나머지는 수로 적는다.
        const [first, ...rest] = [...batch.authors];
        return {
          ...batch,
          authorNote: rest.length > 0 ? `${first} 외 ${rest.length}명` : first,
        };
      });
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

  /**
   * 시험 묶음 하나 — 화면의 접히는 줄 하나.
   *
   * 학생을 처음부터 쭉 늘어놓으면 시험이 몇 번 쌓이는 순간 스크롤만 길어지고
   * "이번 월말평가 누가 빠졌지"를 볼 수 없다. 시험을 먼저 보여주고 그 안에서
   * 학생을 편다.
   */
  interface ReportGroup {
    label: string;
    title: string;
    examLabel: string;
    /** 같은 시험을 여러 번 올렸으면 묶음이 여럿이다 */
    batchIds: string[];
    authors: string[];
    latestAt: string;
    active: number;
    inactive: number;
    views: number;
    /** 알림톡이 한 번이라도 성공한 성적표 수 */
    sent: number;
    rows: AdminReport[];
  }

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
      if (sendStates.length > 0 && !sendStates.includes(report.sendState)) return false;
      // 서버와 같은 하루 경계(한국 시간) — 새벽에 만든 성적표가 전날로 밀리지 않는다
      if (!inRange(report.createdAt, { from: dateFrom || null, to: dateTo || null })) return false;
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
      sendStates.length ||
      types.length ||
      dateFrom ||
      dateTo,
  );
  /** 불러온 목록이 무엇인지 — 기간으로 잘랐으면 '기간 내', 상한에 걸렸으면 '최근', 아니면 '전체' */
  const loadedLabel = hasRange(range) ? "기간 내" : truncated ? "최근" : "전체";

  const groups = useMemo<ReportGroup[]>(() => {
    const map = new Map<string, ReportGroup>();
    for (const report of visibleReports) {
      const label = batchLabel(report);
      let group = map.get(label);
      if (!group) {
        group = {
          label,
          title: report.batchTitle || "제목 없음",
          examLabel: report.examLabel || "",
          batchIds: [],
          authors: [],
          latestAt: report.createdAt,
          active: 0,
          inactive: 0,
          views: 0,
          sent: 0,
          rows: [],
        };
        map.set(label, group);
      }
      if (!group.batchIds.includes(report.batchId)) group.batchIds.push(report.batchId);
      const author = authorOf(report);
      if (!group.authors.includes(author)) group.authors.push(author);
      if (group.latestAt < report.createdAt) group.latestAt = report.createdAt;
      if (report.active) group.active += 1;
      else group.inactive += 1;
      group.views += report.viewCount;
      if (report.sendState === "sent") group.sent += 1;
      group.rows.push(report);
    }
    // 시험은 최근에 만든 것부터. 학생 정렬은 visibleReports가 이미 해 두었다.
    return [...map.values()].sort((a, b) =>
      sort === "oldest" ? a.latestAt.localeCompare(b.latestAt) : b.latestAt.localeCompare(a.latestAt),
    );
  }, [visibleReports, sort]);

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  /**
   * 찾는 중이거나 시험이 하나뿐이면 자동으로 편다.
   *
   * 검색어를 넣었는데 접힌 줄만 보이면 "안 나온다"고 읽힌다. 사람이 접어 둔
   * 것과 싸우지 않도록 상태를 고치지 않고 그릴 때만 덮어쓴다.
   */
  const forceOpen = Boolean(search.trim()) || groups.length === 1;
  const isOpen = (label: string) => forceOpen || openGroups.has(label);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  /** 한 시험의 묶음을 통째로 지운다(같은 시험을 여러 번 올렸으면 여럿) */
  /** 이 성적표(묶음)를 내가 지울 수 있는가 — 만든 사람 또는 총괄 */
  const canDeleteRow = (report: AdminReport) =>
    canDeleteOwned(
      { username: currentUser.username, role: currentUser.role, permissions },
      report.createdByUsername,
    );
  const canDeleteGroup = (group: ReportGroup) => group.rows.every(canDeleteRow);

  async function deleteGroup(group: ReportGroup) {
    if (!permissions.deleteReports) return setError("성적표 삭제 권한이 없습니다.");
    if (!canDeleteGroup(group)) return setError(NOT_OWNER_MESSAGE);
    const confirmed = window.confirm(
      `‘${group.label}’의 성적표 ${group.rows.length}건을 모두 삭제할까요?\n` +
        "학생 명단과 모든 기존 링크가 함께 삭제되며 복구할 수 없습니다.",
    );
    if (!confirmed) return;

    setError("");
    let deleted = 0;
    for (const batchId of group.batchIds) {
      try {
        const response = await fetch(`/api/admin/batches/${batchId}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "묶음 삭제에 실패했습니다.");
        deleted += data.deletedCount ?? 0;
        setReports((current) => current.filter((report) => report.batchId !== batchId));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "묶음 삭제에 실패했습니다.");
        return;
      }
    }
    setStatus(`‘${group.label}’의 성적표 ${deleted || group.rows.length}건을 삭제했습니다.`);
  }

  const filterGroups: FilterGroup[] = [
    // 좌측 메뉴에서 이미 유형을 골랐다면 유형 필터는 숨긴다(중복)
    ...(activeType
      ? []
      : [{ key: "type", label: "유형", options: typeOptions, selected: types, onChange: setTypes }]),
    {
      key: "batch",
      label: "시험",
      // 시험은 회차마다 하나씩 쌓인다. 한 해만 지나도 늘어놓을 수 없으므로
      // 접어 둔다. batches가 이미 최신순이라 최근 시험이 목록 위로 온다.
      dropdown: true,
      allLabel: "전체 시험",
      options: batches.map((b) => ({
        value: b.label,
        label: b.label,
        note: b.authorNote,
        count: b.count,
      })),
      selected: batchFilter,
      onChange: setBatchFilter,
    },
    {
      key: "author",
      label: "만든 사람",
      // 선생님이 늘면 이 목록도 늘어난다. 시험과 같은 이유로 접어 둔다.
      dropdown: true,
      allLabel: "전체",
      options: authorOptions,
      selected: authors,
      onChange: setAuthors,
    },
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
    {
      key: "send",
      label: "발송",
      options: [
        { value: "sent", label: "발송됨", count: typeReports.filter((r) => r.sendState === "sent").length },
        { value: "unsent", label: "미발송", count: typeReports.filter((r) => r.sendState === "unsent").length },
        { value: "failed", label: "실패", count: typeReports.filter((r) => r.sendState === "failed").length },
      ],
      selected: sendStates,
      onChange: setSendStates,
    },
  ];

  function resetFilters() {
    setSearch("");
    setBatchFilter([]);
    setAuthors([]);
    setStatuses([]);
    setSendStates([]);
    setTypes([]);
    // 기간을 지우면 최근 것부터 다시 불러온다
    if (dateFrom || dateTo) changeRange("", "");
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
    if (!canDeleteRow(report)) return setError(NOT_OWNER_MESSAGE);
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


  /**
   * 지금 필터에 맞는 성적표를 한꺼번에 지운다 — 시험·만든 사람·상태·검색·생성일로
   * 추려 둔 그대로. 내가 지울 수 없는 것(남이 만든 묶음)은 빼고 세어서 알린다.
   */
  async function deleteVisibleReports() {
    if (!permissions.deleteReports) return setError("성적표 삭제 권한이 없습니다.");
    const deletable = visibleReports.filter(canDeleteRow);
    const skipped = visibleReports.length - deletable.length;
    if (deletable.length === 0) return setError(NOT_OWNER_MESSAGE);

    const conditions = [
      types.length ? `유형 ${types.map((t) => EXAM_TYPE_LABELS[t as ExamType] ?? t).join(", ")}` : "",
      batchFilter.length ? `시험 ${batchFilter.join(", ")}` : "",
      authors.length ? `만든 사람 ${authors.join(", ")}` : "",
      statuses.length ? `상태 ${statuses.map((v) => (v === "active" ? "활성" : "중지")).join(", ")}` : "",
      search.trim() ? `검색 ‘${search.trim()}’` : "",
      dateFrom || dateTo ? `생성일 ${dateFrom || "…"} ~ ${dateTo || "…"}` : "",
    ].filter(Boolean);
    const typed = window.prompt(
      `지금 필터에 맞는 성적표 ${deletable.length}건과 그 링크를 완전히 삭제합니다.\n` +
        (conditions.length ? `조건: ${conditions.join(" · ")}\n` : "") +
        (skipped > 0 ? `(남이 만든 ${skipped}건은 제외됩니다)\n` : "") +
        "학부모에게 이미 보낸 링크도 즉시 열리지 않으며 복구할 수 없습니다.\n계속하려면 ‘삭제’를 입력하세요.",
    );
    if (typed !== "삭제") return;

    setError("");
    try {
      const response = await fetch("/api/admin/reports/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deletable.map((report) => report.id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "삭제에 실패했습니다.");
      const removed = new Set(deletable.map((report) => report.id));
      setReports((current) => current.filter((report) => !removed.has(report.id)));
      setStatus(
        `필터에 맞는 성적표 ${data.deletedCount ?? deletable.length}건과 링크를 삭제했습니다.` +
          ((data.deniedCount ?? 0) > 0 ? ` 남이 만든 ${data.deniedCount}건은 그대로 두었습니다.` : ""),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "삭제에 실패했습니다.");
    }
  }

  async function deleteAllReports() {
    // 남의 것까지 한꺼번에 지우므로 총괄만
    if (currentUser.role !== "admin" || !reports.length) return;
    // 서버는 기간·상한과 무관하게 전부 지운다 — 화면에 불러온 건수가 전부인 양 적지 않는다
    const typed = window.prompt(
      "저장된 성적표와 모든 링크를 전부 삭제합니다.\n" +
        `지금 불러온 ${reports.length}건뿐 아니라 모든 기간의 성적표가 대상입니다.\n계속하려면 ‘전체삭제’를 입력하세요.`,
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
                {/* '전체'라고 적는 것은 정말 전부일 때뿐 — 기간이나 상한으로 잘렸으면 그렇게 적는다 */}
                {filtering
                  ? `${visibleReports.length}건 표시 중 (${loadedLabel} ${typeReports.length}건)`
                  : `${loadedLabel} ${typeReports.length}건`}
                {" · "}권한에 따라 링크 관리, 내보내기와 삭제 기능을 사용할 수 있습니다.
              </p>
            </div>
            <div className="toolbar">
              {permissions.exportReports ? <a className="button secondary" href="/api/admin/export">전체 CSV</a> : null}
              {/* 필터로 추린 것만 지운다 — 필터가 하나라도 걸려 있을 때만 보인다(전체와 헷갈리지 않게) */}
              {permissions.deleteReports && filtering && visibleReports.length > 0 ? (
                <button
                  className="button danger"
                  onClick={deleteVisibleReports}
                  title="지금 필터(시험·만든 사람·상태·검색·생성일)에 맞는 성적표만 삭제합니다"
                >
                  표시된 {visibleReports.length}건 삭제
                </button>
              ) : null}
              {currentUser.role === "admin" ? <button className="button danger" onClick={deleteAllReports} disabled={!reports.length}>전체삭제</button> : null}
            </div>
          </div>

          {hasRange(range) ? (
            <p className="list-notice range">
              생성일 <strong>{rangeLabel(range)}</strong> 기간의 성적표만 불러왔습니다
              {truncated ? ` (이 기간도 ${cap.toLocaleString()}건이 넘어 최근 ${cap.toLocaleString()}건만)` : ""}. 기간을 지우면
              최근 것부터 다시 불러옵니다.
            </p>
          ) : truncated ? (
            <p className="list-notice">
              최근 <strong>{cap.toLocaleString()}건</strong>만 불러왔습니다. 더 오래된 성적표는 아래 <strong>생성일</strong>{" "}
              칸에 기간을 넣으면 그 기간만 다시 불러옵니다. ‘전체 CSV’는 상한 없이 모두 내려받습니다.
            </p>
          ) : null}

          {typeReports.length > 0 || hasRange(range) ? (
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
                <input type="date" value={dateFrom} onChange={(e) => changeRange(e.target.value, dateTo)} />
                <span>~</span>
                <input type="date" value={dateTo} onChange={(e) => changeRange(dateFrom, e.target.value)} />
                {dateFrom || dateTo ? (
                  <button type="button" className="button tiny ghost" onClick={() => changeRange("", "")}>
                    기간 지우기
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {status ? <p className="status-message">{status}</p> : null}
          {error ? <p className="form-error block">{error}</p> : null}

          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>학생</th><th>리포트 묶음</th><th>생성자</th><th>상태</th><th>조회</th><th>발송</th><th>링크 관리</th></tr></thead>
              {groups.map((group) => {
                const open = isOpen(group.label);
                return (
                  <tbody key={group.label} className={`report-group${open ? " open" : ""}`}>
                    <tr className="group-row">
                      <td colSpan={6}>
                        <div className="group-line">
                          <button
                            type="button"
                            className="group-toggle"
                            aria-expanded={open}
                            onClick={() => toggleGroup(group.label)}
                          >
                            <span className="group-caret" aria-hidden="true" />
                            <span className="group-name">
                              <strong>{group.title}</strong>
                              {group.examLabel ? <em>{group.examLabel}</em> : null}
                            </span>
                          </button>
                          <div className="group-meta">
                            <span>
                              <b>{group.rows.length}</b>명
                            </span>
                            {group.inactive > 0 ? (
                              <span className="muted">중지 {group.inactive}</span>
                            ) : null}
                            <span className="muted">조회 {group.views}회</span>
                            <span className={group.sent < group.rows.length ? "muted need" : "muted"} title="알림톡이 한 번이라도 성공한 성적표 수">
                              발송 {group.sent}/{group.rows.length}
                            </span>
                            <span className="muted">{group.authors.join(", ")}</span>
                            <span className="muted">
                              {new Date(group.latestAt).toLocaleDateString("ko-KR")}
                            </span>
                            {(() => {
                              // 묶음의 시험 id — 그 시험 전원의 결과 요약으로 간다
                              const examId = group.rows.find((r) => r.examId)?.examId;
                              return examId ? (
                                <Link className="inline-link" href={`/admin/omr/${examId}/summary`}>
                                  결과 요약
                                </Link>
                              ) : null;
                            })()}
                            {permissions.deleteReports && canDeleteGroup(group) ? (
                              <button className="inline-delete" onClick={() => deleteGroup(group)}>
                                이 시험 삭제
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {open
                      ? group.rows.map((report) => (
                          <tr key={report.id} className="student-row">
                            <td><strong>{report.studentName}</strong><span>{report.school || "학교 미입력"} · {formatMiddleGrade(report.grade)}</span></td>
                            <td><strong>{report.batchTitle}</strong><span>{report.examLabel}</span></td>
                            <td><strong>{report.createdByName || "관리자"}</strong><span>{new Date(report.createdAt).toLocaleDateString("ko-KR")}</span></td>
                            <td><span className={`status-chip ${report.active ? "active" : "inactive"}`}>{report.active ? "활성" : "중지"}</span><span>{report.pinRequired ? "PIN 보호" : "PIN 없음"}</span></td>
                            <td><strong>{report.viewCount}회</strong><span>{report.lastViewedAt ? new Date(report.lastViewedAt).toLocaleString("ko-KR") : "아직 열람 전"}</span></td>
                            <td>
                              {/* 알림톡 발송 여부 — 학부모·학생 어느 쪽이든 성공했으면 '발송됨' */}
                              <span
                                className={`status-chip ${report.sendState === "sent" ? "active" : report.sendState === "failed" ? "danger" : "inactive"}`}
                                title={report.sendError ?? undefined}
                              >
                                {report.sendState === "sent" ? "발송됨" : report.sendState === "failed" ? "발송 실패" : "미발송"}
                              </span>
                              <span>
                                {report.sendState === "sent"
                                  ? `${[report.sentParent ? "학부모" : "", report.sentStudent ? "학생" : ""].filter(Boolean).join("·")}${report.lastSentAt ? ` · ${new Date(report.lastSentAt).toLocaleDateString("ko-KR")}` : ""}`
                                  : report.sendState === "failed"
                                    ? "발송 화면에서 다시 보내기"
                                    : "아직 안 보냄"}
                              </span>
                            </td>
                            <td><div className="row-actions">
                              <a className="button tiny ghost" href={report.url} target="_blank" rel="noreferrer">웹</a>
                              <a className="button tiny ghost" href={`${report.url}?layout=a4`} target="_blank" rel="noreferrer">A4</a>
                              <button className="button tiny secondary" onClick={() => copyLink(report.url, report.id)}>{copied === report.id ? "복사됨" : "복사"}</button>
                              {permissions.manageReports ? <><button className="button tiny ghost" onClick={() => changeReport(report, report.active ? "deactivate" : "activate")}>{report.active ? "중지" : "활성화"}</button><button className="button tiny ghost" onClick={() => changeReport(report, "regenerate")}>새 링크</button></> : null}
                              {permissions.deleteReports && canDeleteRow(report) ? <button className="button tiny danger" onClick={() => deleteReport(report)}>삭제</button> : null}
                            </div></td>
                          </tr>
                        ))
                      : null}
                  </tbody>
                );
              })}
              {!groups.length ? (
                <tbody>
                  <tr><td colSpan={6} className="empty-cell">{filtering ? "조건에 맞는 성적표가 없습니다." : "표시할 성적표가 없습니다."}</td></tr>
                </tbody>
              ) : null}
            </table>
          </div>
        </section>
      ) : (
        <section className="panel reports-panel"><div className="permission-denied"><strong>성적표 목록 조회 권한이 없습니다.</strong><p>관리자에게 해당 권한을 요청해 주세요.</p></div></section>
      )}
    </main>
  );
}
