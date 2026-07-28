"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  DEFAULT_USER_PERMISSIONS,
  PERMISSION_LABELS,
  USER_PERMISSION_KEYS,
  type UserPermissionKey,
  type UserPermissions,
} from "@/lib/access";
import type { ManagedUser } from "@/lib/users";

function copyPermissions(value: UserPermissions): UserPermissions {
  return { ...value };
}

export default function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ManagedUser>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "사용자 목록을 불러오지 못했습니다.");
      const loaded = (data.users ?? []) as ManagedUser[];
      setUsers(loaded);
      setDrafts(Object.fromEntries(loaded.map((user) => [user.id, { ...user, permissions: copyPermissions(user.permissions) }])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사용자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          displayName: formData.get("displayName"),
          password: formData.get("password"),
          permissions: DEFAULT_USER_PERMISSIONS,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "사용자 계정을 만들지 못했습니다.");
      const user = data.user as ManagedUser;
      setUsers((current) => [...current, user]);
      setDrafts((current) => ({ ...current, [user.id]: { ...user, permissions: copyPermissions(user.permissions) } }));
      setStatus(`${user.displayName} 계정을 등록했습니다.`);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사용자 계정을 만들지 못했습니다.");
    }
  }

  function patchDraft(id: string, patch: Partial<ManagedUser>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function patchPermission(id: string, permission: UserPermissionKey, checked: boolean) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        permissions: { ...current[id].permissions, [permission]: checked },
      },
    }));
  }

  async function saveUser(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft.displayName,
          active: draft.active,
          permissions: draft.permissions,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "사용자 권한을 저장하지 못했습니다.");
      const user = data.user as ManagedUser;
      setUsers((current) => current.map((item) => (item.id === id ? user : item)));
      setDrafts((current) => ({ ...current, [id]: { ...user, permissions: copyPermissions(user.permissions) } }));
      setStatus(`${user.displayName} 계정 설정을 저장했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "사용자 권한을 저장하지 못했습니다.");
    } finally {
      setSavingId("");
    }
  }

  async function resetPassword(user: ManagedUser) {
    const password = window.prompt(`${user.displayName} 계정의 새 비밀번호를 입력하세요.\n8자 이상이어야 합니다.`);
    if (!password) return;
    setSavingId(user.id);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "비밀번호를 변경하지 못했습니다.");
      setStatus(`${user.displayName} 계정의 비밀번호를 변경했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "비밀번호를 변경하지 못했습니다.");
    } finally {
      setSavingId("");
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(`${user.displayName}(${user.username}) 계정을 삭제할까요?\n삭제 즉시 해당 계정은 로그인할 수 없습니다.`)) return;
    setSavingId(user.id);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "계정을 삭제하지 못했습니다.");
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
      setStatus(`${user.displayName} 계정을 삭제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "계정을 삭제하지 못했습니다.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="panel users-panel">
      <div className="section-heading wrap">
        <div>
          <p className="eyebrow">관리자 전용</p>
          <h2>일반 사용자 계정 관리</h2>
          <p className="subtle">일반 사용자는 AI 모델 선택과 계정 관리에는 접근할 수 없습니다. 그 밖의 기능은 아래 권한으로 조정합니다.</p>
        </div>
      </div>

      <form className="user-create-form" onSubmit={createUser}>
        <label><span>로그인 아이디</span><input name="username" placeholder="예: teacher01" autoComplete="off" required /></label>
        <label><span>사용자 이름</span><input name="displayName" placeholder="예: 김유진 선생님" autoComplete="off" required /></label>
        <label><span>초기 비밀번호</span><input name="password" type="password" minLength={8} placeholder="8자 이상" autoComplete="new-password" required /></label>
        <button className="button primary" type="submit">일반 사용자 등록</button>
      </form>

      {status ? <p className="status-message">{status}</p> : null}
      {error ? <p className="form-error block">{error}</p> : null}

      {loading ? <p className="user-loading">사용자 계정을 불러오는 중입니다…</p> : null}
      {!loading && !users.length ? <p className="empty-user-state">등록된 일반 사용자 계정이 없습니다.</p> : null}

      <div className="user-account-list">
        {users.map((user) => {
          const draft = drafts[user.id] ?? user;
          return (
            <article className="user-account-card" key={user.id}>
              <div className="user-account-head">
                <div>
                  <strong>{user.username}</strong>
                  <span>{user.lastLoginAt ? `최근 로그인 ${new Date(user.lastLoginAt).toLocaleString("ko-KR")}` : "아직 로그인하지 않음"}</span>
                </div>
                <label className="account-active-toggle">
                  <input type="checkbox" checked={draft.active} onChange={(event) => patchDraft(user.id, { active: event.target.checked })} />
                  <span>{draft.active ? "사용 가능" : "로그인 중지"}</span>
                </label>
              </div>

              <label className="user-display-name">
                <span>표시 이름</span>
                <input value={draft.displayName} onChange={(event) => patchDraft(user.id, { displayName: event.target.value })} />
              </label>

              <div className="permission-grid">
                {USER_PERMISSION_KEYS.map((permission) => (
                  <label key={permission}>
                    <input
                      type="checkbox"
                      checked={draft.permissions[permission]}
                      onChange={(event) => patchPermission(user.id, permission, event.target.checked)}
                    />
                    <span>{PERMISSION_LABELS[permission]}</span>
                  </label>
                ))}
              </div>

              <div className="user-account-actions">
                <button className="button small primary" type="button" disabled={savingId === user.id} onClick={() => saveUser(user.id)}>
                  {savingId === user.id ? "처리 중…" : "권한 저장"}
                </button>
                <button className="button small secondary" type="button" disabled={savingId === user.id} onClick={() => resetPassword(user)}>비밀번호 재설정</button>
                <button className="button small danger" type="button" disabled={savingId === user.id} onClick={() => deleteUser(user)}>계정 삭제</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
