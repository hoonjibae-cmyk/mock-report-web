import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { readSettings } from "@/lib/app-settings";
import SettingsPanel from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  // 설정은 관리자 전용 — 일반 사용자는 홈으로 돌려보낸다
  if (user.role !== "admin") redirect("/admin");

  const settings = await readSettings();

  return (
    <SettingsPanel
      initialAiModel={settings.aiModel}
      storageReady={settings.storageReady}
      canEdit
      currentUser={{
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      }}
    />
  );
}
