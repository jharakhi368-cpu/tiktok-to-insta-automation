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
    // Surface the real cause: Drizzle's wrapper keeps the PostgreSQL code and
    // message on `cause`, which is why this failure was previously invisible.
    const { describeDbError, hintFor } = await import("@/lib/otp");
    const info = describeDbError(e);
    const hint = hintFor(info.code);
    console.error(
      "[otp] request failed",
      JSON.stringify({ code: info.code ?? null, hint: hint ?? null, message: info.message }),
    );
    return NextResponse.json(
      {
        error: hint ? `${info.message} — ${hint}` : info.message,
        code: info.code ?? null,
        hint: hint ?? null,
      },
      { status: 500 },
    );
  }
}
