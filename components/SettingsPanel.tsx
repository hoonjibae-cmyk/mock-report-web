"use client";

import { useState } from "react";
import AdminTopNav, { type NavUser } from "@/components/AdminTopNav";
import { AI_MODEL_OPTIONS, type AiModelId } from "@/lib/ai-models";
import { COMMENT_STYLE_LABELS, type CommentStyle } from "@/lib/omr-comments";
import { APP_VERSION_LABEL } from "@/lib/version";

interface Props {
  initialAiModel: AiModelId;
  /** 알림톡 시험 발송을 받을 번호(하이픈 없는 숫자) */
  initialTestPhone: string;
  /** 새 시험에 기본으로 잡을 담임 의견 작성 방식 */
  initialCommentStyle: CommentStyle;
  /** 설정 저장소(app_settings 테이블)가 준비되어 있는가 */
  storageReady: boolean;
  /** 학생 관리 프로그램 연동(STUDENT_API_URL)이 설정되어 있는가 */
  directoryConfigured: boolean;
  canEdit: boolean;
  currentUser: NavUser;
}

/** 화면에 보여 줄 때만 하이픈을 넣는다. 저장은 서버가 숫자만 남긴다. */
function formatPhone(value: string): string {
  const d = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}

export default function SettingsPanel({
  initialAiModel,
  initialTestPhone,
  initialCommentStyle,
  storageReady,
  directoryConfigured,
  canEdit,
  currentUser,
}: Props) {
  const [aiModel, setAiModel] = useState<AiModelId>(initialAiModel);
  const [commentStyle, setCommentStyle] = useState<CommentStyle>(initialCommentStyle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [directoryStatus, setDirectoryStatus] = useState("");
  const [directoryChecking, setDirectoryChecking] = useState(false);
  // 알림톡 시험 발송 — 학부모 60명에게 보내기 전에 한 번 받아 본다
  const [testPhone, setTestPhone] = useState(formatPhone(initialTestPhone));
  const [testSaving, setTestSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState("");

  async function saveTestPhone() {
    setTestSaving(true);
    setTestStatus("");
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "번호를 저장하지 못했습니다.");
      setTestPhone(formatPhone(data.settings?.testPhone ?? testPhone));
      setTestStatus("번호를 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "번호를 저장하지 못했습니다.");
    } finally {
      setTestSaving(false);
    }
  }

  async function sendTest() {
    // 실제로 나가는 메시지다. 눌렀는데 안 왔을 때와 잘못 눌렀을 때를 구분할 수
    // 있어야 하므로, 어느 번호로 가는지 적어 확인을 받는다.
    if (!window.confirm(`${testPhone} 으로 알림톡을 한 건 보냅니다. 진행할까요?`)) return;
    setTestSending(true);
    setTestStatus("");
    setError("");
    try {
      const res = await fetch("/api/admin/messaging/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "시험 발송에 실패했습니다.");
      setTestStatus(
        data.channel === "alimtalk"
          ? `${data.phoneMasked} 로 알림톡을 보냈습니다. 휴대전화를 확인해 주세요.`
          : `${data.phoneMasked} 로 보냈습니다(문자로 대체 발송됨). 휴대전화를 확인해 주세요.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "시험 발송에 실패했습니다.");
    } finally {
      setTestSending(false);
    }
  }

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

  /** 새 시험의 기본 작성 방식 저장 — 이미 만든 시험에는 영향이 없다 */
  async function saveCommentStyle(next: CommentStyle) {
    const previous = commentStyle;
    setCommentStyle(next);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentStyle: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "설정을 저장하지 못했습니다.");
      setMessage(
        `새 시험의 담임 의견 방식을 '${COMMENT_STYLE_LABELS[next]}'로 저장했습니다. 이미 만든 시험은 그대로입니다.`,
      );
    } catch (err) {
      setCommentStyle(previous); // 저장 실패 — 화면을 되돌린다
      setError(err instanceof Error ? err.message : "설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
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
            <p className="eyebrow">담임 의견</p>
            <h2>기본 작성 방식</h2>
            <p className="subtle">
              <strong>새로 만드는 시험</strong>에 기본으로 잡히는 방식입니다. 선생님마다 쓰는
              방식이 다를 수 있으므로, 시험마다 담임 의견 화면에서 바꿀 수 있습니다.
            </p>
          </div>
        </div>

        <div className="style-options">
          {(["free", "structured"] as CommentStyle[]).map((option) => {
            const on = commentStyle === option;
            return (
              <button
                key={option}
                type="button"
                className={`style-option${on ? " on" : ""}`}
                disabled={!canEdit || saving}
                aria-pressed={on}
                onClick={() => {
                  if (!on) void saveCommentStyle(option);
                }}
              >
                <strong>{COMMENT_STYLE_LABELS[option]}</strong>
                <span>
                  {option === "free"
                    ? "총평 한 칸과 학생별 의견 한 칸에 자유롭게 씁니다."
                    : "위에 더해 영역별 출제 안내와 영역별 평가(등급 + 서술)까지 적습니다."}
                </span>
              </button>
            );
          })}
        </div>
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

      {/*
        학부모에게 나가기 전에 한 번 받아 보는 자리. 실제 발송은 되돌릴 수
        없으므로, 문구·응시일 표기·버튼이 여는 주소를 먼저 눈으로 본다.
      */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="section-heading wrap">
          <div>
            <p className="eyebrow">MESSAGING</p>
            <h2>알림톡 시험 발송</h2>
            <p className="subtle">
              학부모에게 보내기 전에 <strong>정해 둔 번호로 한 건</strong> 보내 봅니다. 실제
              템플릿·실제 발송이라 문구와 버튼이 그대로 옵니다.
            </p>
          </div>
        </div>

        <div className="test-send">
          <label htmlFor="test-phone">받을 번호</label>
          <div className="test-send-row">
            <input
              id="test-phone"
              value={testPhone}
              inputMode="numeric"
              placeholder="010-0000-0000"
              disabled={!canEdit}
              onChange={(e) => setTestPhone(formatPhone(e.target.value))}
            />
            <button
              className="button secondary"
              type="button"
              disabled={!canEdit || testSaving}
              onClick={saveTestPhone}
            >
              {testSaving ? "저장 중…" : "번호 저장"}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!canEdit || testSending}
              onClick={sendTest}
            >
              {testSending ? "보내는 중…" : "시험 발송"}
            </button>
          </div>
          {testStatus ? <p className="status-message">{testStatus}</p> : null}
          <p className="subtle">
            번호를 바꾸면 <strong>번호 저장</strong>을 먼저 눌러 주세요. 시험 발송은 저장된 번호로
            나갑니다.
          </p>
          <div className="info-box">
            <strong>확인할 것</strong>
            <p>
              문구가 심사받은 템플릿과 같은지 · 응시일이 제대로 들어갔는지 · 버튼이{" "}
              <code>report.yussam.com</code> 을 여는지.
            </p>
            <p>
              버튼을 누르면 <strong>성적표 대신 안내 화면</strong>이 뜹니다 — 남의 성적표 주소를
              시험 삼아 부르지 않기 위해 가짜 링크를 씁니다. 성적표 화면까지 보시려면 발송
              화면에서 한 명만 골라 보내 주세요.
            </p>
          </div>
        </div>
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
