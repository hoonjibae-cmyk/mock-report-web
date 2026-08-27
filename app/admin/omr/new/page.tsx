import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import OmrExamForm from "@/components/OmrExamForm";

export const dynamic = "force-dynamic";

export default async function NewOmrExamPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasPermission(user, "createReports")) redirect("/admin/omr");
  return <OmrExamForm />;
}
