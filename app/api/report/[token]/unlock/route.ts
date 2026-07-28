import { NextResponse } from "next/server";
import { setReportAccessCookie } from "@/lib/auth";
import { verifyPin } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => null)) as { pin?: string } | null;
  const pin = String(body?.pin ?? "").replace(/\D/g, "").slice(-4);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("student_reports")
    .select("is_active,pin_required,access_pin_hash")
    .eq("public_token", token)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return NextResponse.json({ error: "유효하지 않거나 중지된 성적표입니다." }, { status: 404 });
  }

  if (data.pin_required && (!pin || !verifyPin(pin, data.access_pin_hash))) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: "휴대전화 뒤 4자리가 일치하지 않습니다." }, { status: 401 });
  }

  await setReportAccessCookie(token);
  return NextResponse.json({ ok: true });
}
