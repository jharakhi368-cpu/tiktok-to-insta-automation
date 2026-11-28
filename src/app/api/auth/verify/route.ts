import { NextResponse } from "next/server";
import { createSession, isSecureRequest, setSessionCookie } from "@/lib/auth";
import { verifyOtp } from "@/lib/otp";

export const dynamic = "force-dynamic";

/** Step 2: check the code and open a session. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      code?: string;
    };

    const result = await verifyOtp(String(body.email ?? ""), String(body.code ?? ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    await setSessionCookie(await createSession(result.user.id), {
      secure: isSecureRequest(req),
    });

    return NextResponse.json({ user: { id: result.user.id, email: result.user.email } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not sign in" },
      { status: 500 },
    );
  }
}
