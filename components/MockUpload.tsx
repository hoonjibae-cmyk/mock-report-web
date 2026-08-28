"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import type { AiModelId } from "@/lib/ai-models";
import type { UserPermissions } from "@/lib/access";

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

interface Props {
  setupError?: string;
  aiEnabled: boolean;
  currentUser: NavUser & { permissions: UserPermissions };
}

export default function MockUpload({ setupError, aiEnabled, currentUser }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser.role === "admin";
  const permissions = currentUser.permissions;
  const [created, setCreated] = useState<CreatedReport[]>([]);
  const [createdBatchId, setCreatedBatchId] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState(setupError ?? "");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");

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
    // AI 모델은 서버가 시스템 설정에서 읽는다(관리자 → 설정)
    formData.delete("aiModel");
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
        `${data.reportCount}명의 웹리포트 링크를 생성했습니다.${aiEnabled ? ` AI 총평 모델: ${data.aiModel}` : ""}`,
      );
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

  return (
    <main className="admin-shell">
      <AdminTopNav user={currentUser} />

      <div className="admin-grid">
        <section className="panel upload-panel">
          <div className="section-heading">
            <div><p className="eyebrow">국영수 모의고사</p><h1>성적 엑셀 업로드</h1></div>
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
                <div className="info-box compact-info">
                  <strong>AI 총평</strong>
                  <p>
                    {aiEnabled
                      ? "관리자 → 설정에서 정한 AI 총평 모델이 적용됩니다."
                      : "OPENAI_API_KEY가 없어 규칙 기반 총평으로 생성됩니다."}
                  </p>
                </div>
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
            <li><span>4</span><div><strong>AI 총평</strong><p>설정에서 정한 AI 모델로 강점·보완점·학습 계획을 작성합니다.</p></div></li>
            <li><span>5</span><div><strong>개별 링크</strong><p>학부모에게 보낼 반응형 웹리포트 링크를 생성합니다.</p></div></li>
          </ol>
        </aside>
      </div>

      {created.length ? (
        <section className="panel result-panel">
          <div className="section-heading wrap">
            <div><p className="eyebrow">방금 생성됨</p><h2>학생별 웹리포트 링크</h2></div>
            <div className="toolbar">
              {permissions.exportReports ? <a className="button secondary" href={`/api/admin/export?batchId=${encodeURIComponent(createdBatchId)}`}>CSV 받기</a> : null}
              <Link className="button secondary" href="/admin/reports">웹 리포트 관리로 이동</Link>
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
    </main>
  );
}
