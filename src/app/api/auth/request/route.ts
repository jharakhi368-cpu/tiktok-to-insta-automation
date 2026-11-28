import { NextResponse } from "next/server";
import { requestOtp } from "@/lib/otp";

export const dynamic = "force-dynamic";

/** Step 1: ask for a code. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const result = await requestOtp(String(body.email ?? ""));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      emailed: result.emailed,
      // shown only while no email provider is configured
      devCode: "devCode" in result ? result.devCode : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send a code" },
      { status: 500 },
    );
  }
}
