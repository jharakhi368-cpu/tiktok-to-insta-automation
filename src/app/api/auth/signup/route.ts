import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  claimOrphans,
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!EMAIL.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password needs at least 8 characters." },
        { status: 400 },
      );
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length) {
      return NextResponse.json(
        { error: "An account with that email already exists — sign in instead." },
        { status: 409 },
      );
    }

    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: hashPassword(password) })
      .returning();

    // anything created before auth existed now belongs to this account
    await claimOrphans(user.id);

    await setSessionCookie(await createSession(user.id));
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create the account" },
      { status: 500 },
    );
  }
}
