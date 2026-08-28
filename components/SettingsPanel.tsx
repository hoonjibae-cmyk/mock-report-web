"use client";

import { useState } from "react";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import { AI_MODEL_OPTIONS, type AiModelId } from "@/lib/ai-models";
import { APP_VERSION_LABEL } from "@/lib/version";

interface Props {
  initialAiModel: AiModelId;
  /** 설정 저장소(app_settings 테이블)가 준비되어 있는가 */
  storageReady: boolean;
  /** 학생 관리 프로그램 연동(STUDENT_API_URL)이 설정되어 있는가 */
  directoryConfigured: boolean;
  canEdit: boolean;
  currentUser: NavUser;
}

export default function SettingsPanel({
  initialAiModel,
  storageReady,
  directoryConfigured,
  canEdit,
  currentUser,
}: Props) {
  const [aiModel, setAiModel] = useState<AiModelId>(initialAiModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [directoryStatus, setDirectoryStatus] = useState("");
  const [directoryChecking, setDirectoryChecking] = useState(false);

  async function checkDirectory() {
    setDirectoryChecking(true);
    setDirectoryStatus("");
    try {
      const res = await fetch("/api/admin/students/lookup");
      const data = await res.json().catch(() => ({}));
      if (!data.configured) setDirectoryStatus("STUDENT_API_URL이 설정되어 있지 않습니다.");
      else setDirectoryStatus(data.message || (data.reachable ? "연결됨" : "연결 실패"));
    } catch {
      setDirectoryStatus("확인 중 오류가 발생했습니다.");
    } finally {
      setDirectoryChecking(false);
    }
  }

  async function save(next: AiModelId) {
    const previous = aiModel;
    setAiModel(next);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiModel: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "설정을 저장하지 못했습니다.");
      setMessage(
        `AI 총평 모델을 '${AI_MODEL_OPTIONS.find((o) => o.value === next)?.label}'로 저장했습니다. 이제 모든 AI 기능이 이 모델을 씁니다.`,
      );
    } catch (err) {
      setAiModel(previous); // 저장 실패 — 화면을 되돌린다
      setError(err instanceof Error ? err.message : "설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-shell">
      <AdminTopNav user={currentUser} />

      {error ? <p className="form-error block">{error}</p> : null}
      {message ? <p className="subtle">{message}</p> : null}

      {!storageReady ? (
        <p className="form-error block">
          <strong>설정 저장소가 아직 만들어지지 않았습니다.</strong> Supabase → SQL Editor 에서{" "}
          <code>supabase/migration_v5_app_settings.sql</code> 을 실행해 주세요. 그때까지는 기본
          모델로 동작합니다.
        </p>
      ) : null}

      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SETTINGS</p>
            <h2>AI 총평 모델</h2>
            <p className="subtle">
              여기서 고른 모델이 <strong>모든 AI 기능</strong>에 적용됩니다 — 국영수 모의고사
              성적표의 AI 총평, 담임 의견 초안 등. 학원 전체가 같은 값을 쓰며, 사람이나 기기마다
              달라지지 않습니다.
            </p>
          </div>
        </div>

        <div className="ai-model-options">
          {AI_MODEL_OPTIONS.map((option) => {
            const on = aiModel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`ai-model-option${on ? " active" : ""}`}
                disabled={!canEdit || saving}
                aria-pressed={on}
                onClick={() => {
                  if (!on) void save(option.value);
                }}
              >
                <strong>{option.label}</strong>
                <span>{option.note}</span>
              </button>
            );
          })}
        </div>

        {!canEdit ? (
          <p className="subtle" style={{ marginTop: 12 }}>
            AI 모델 변경은 관리자만 할 수 있습니다.
          </p>
        ) : null}
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">INTEGRATION</p>
            <h2>학생 정보 연동</h2>
            <p className="subtle">
              답안지에서 읽히는 학생 정보는 <strong>수험번호</strong> 하나뿐입니다. 이름·학교·
              학부모 연락처는 <strong>학생 관리 프로그램(Student-Card)</strong>에서 불러옵니다 —
              OMR의 수험번호가 곧 <strong>Student-Card의 카드번호</strong>입니다. 이 시스템에는
              학생 명부를 따로 두지 않습니다.
            </p>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={checkDirectory}
            disabled={directoryChecking}
          >
            {directoryChecking ? "확인 중…" : "연결 확인"}
          </button>
        </div>
        {directoryConfigured ? (
          <div className="info-box">
            <strong>연동 설정됨</strong>
            <p>
              성적표 화면의 <strong>학생 정보 불러오기</strong>로 가져옵니다.
              {directoryStatus ? ` — ${directoryStatus}` : ""}
            </p>
          </div>
        ) : (
          <div className="permission-denied">
            <strong>아직 연동되지 않았습니다.</strong>
            <p>
              Vercel → Settings → Environment Variables 에 <code>STUDENT_API_URL</code>(학생 관리
              프로그램 주소)과 <code>STUDENT_API_KEY</code>(상대 쪽 <code>API_KEY</code>와 같은 값)를
              추가한 뒤 다시 배포해 주세요. 연동 전에는 성적표 화면에서 이름을 직접 입력하면 됩니다.
              {directoryStatus ? ` — ${directoryStatus}` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">SYSTEM</p>
            <h2>시스템 정보</h2>
          </div>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          {APP_VERSION_LABEL}
        </p>
      </div>
    </main>
  );
}
