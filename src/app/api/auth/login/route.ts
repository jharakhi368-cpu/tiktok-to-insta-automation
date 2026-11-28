import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const user = rows[0];

    // always run the KDF so a missing account and a wrong password
    // take the same time — no user enumeration by timing
    const ok = verifyPassword(password, user?.passwordHash ?? "00:00");
    if (!user || !ok) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    await setSessionCookie(await createSession(user.id), req);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not sign in" },
      { status: 500 },
    );
  }
}
