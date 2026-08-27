import MockUpload from "@/components/MockUpload";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MockUploadPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  return (
    <MockUpload
      aiEnabled={Boolean(process.env.OPENAI_API_KEY)}
      currentUser={{
        username: currentUser.username,
        displayName: currentUser.displayName,
        role: currentUser.role,
        permissions: currentUser.permissions,
      }}
    />
  );
}
