import { redirect } from "next/navigation";
import AdminTopNav from "@/components/AdminTopNav";
import UserManagement from "@/components/UserManagement";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;
  if (currentUser.role !== "admin") redirect("/admin");

  return (
    <main className="admin-shell">
      <AdminTopNav
        user={{
          username: currentUser.username,
          displayName: currentUser.displayName,
          role: currentUser.role,
        }}
      />
      <UserManagement />
    </main>
  );
}
