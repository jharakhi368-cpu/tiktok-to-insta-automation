import { NextResponse } from "next/server";
import { envState } from "@/lib/pipeline";
import { requireUser, currentUser } from "@/lib/auth";
import { igProvider, igReady, primeIg, verifyInstagram } from "@/lib/instagram";
import { listZernioAccounts, verifyZernio } from "@/lib/zernio";
import { KEYS, getMany, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ALL_KEYS = [
  KEYS.igToken,
  KEYS.igUserId,
  KEYS.igUsername,
  KEYS.zKey,
  KEYS.zAccount,
];

async function state(userId?: string | null) {
  const s = await getMany(ALL_KEYS, userId);
  await primeIg(userId);
  return {
    provider: igProvider(userId),
    instagram: {
      linked: igReady(userId),
      source: s[KEYS.zKey]
        ? "zernio"
        : s[KEYS.igToken]
          ? "console"
          : igReady()
            ? "env"
            : null,
      username: s[KEYS.igUsername] ?? null,
      userId: s[KEYS.zAccount] ?? s[KEYS.igUserId] ?? process.env.IG_BUSINESS_ACCOUNT_ID ?? null,
      tokenTail: s[KEYS.zKey]
        ? `…${s[KEYS.zKey]!.slice(-4)}`
        : s[KEYS.igToken]
          ? `…${s[KEYS.igToken]!.slice(-4)}`
          : process.env.IG_ACCESS_TOKEN
            ? `…${process.env.IG_ACCESS_TOKEN.slice(-4)}`
            : null,
      zernio: {
        linked: Boolean(s[KEYS.zKey] && s[KEYS.zAccount]),
        accountId: s[KEYS.zAccount] ?? null,
        keyTail: s[KEYS.zKey] ? `…${s[KEYS.zKey]!.slice(-4)}` : null,
      },
    },
    env: envState(userId),
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const url = new URL(req.url);
    if (url.searchParams.get("test") === "1") {
      const s = await getMany(ALL_KEYS, user.id);
      if (s[KEYS.zKey]) {
        const { verifyZernio: v } = await import("@/lib/zernio");
        return NextResponse.json(await v(s[KEYS.zKey]!));
      }
      const token = s[KEYS.igToken] || process.env.IG_ACCESS_TOKEN;
      if (!token) return NextResponse.json({ ok: false, error: "No Instagram account linked yet." });
      return NextResponse.json(await verifyInstagram(token, s[KEYS.igUserId] ?? undefined));
    }
    return NextResponse.json(await state(user.id));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "settings failed" },
      { status: 500 },
    );
  }
}

/** Link Instagram through Zernio (preferred) or the Meta Graph API. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    // ── refresh the stored account id (after a reconnect in Zernio) ──
    if (body.action === "refresh") {
      const s = await getMany(ALL_KEYS, user.id);
      const key = s[KEYS.zKey];
      if (!key) {
        return NextResponse.json({ error: "No Zernio key linked yet." }, { status: 400 });
      }
      const accounts = await listZernioAccounts(key);
      if (!accounts.length) {
        return NextResponse.json(
          { error: "Zernio returned no accounts — reconnect Instagram in Zernio first." },
          { status: 400 },
        );
      }
      const fresh =
        accounts.find((a) => a.id === s[KEYS.zAccount]) ??
        accounts.find((a) => (a.platform ?? "instagram") === "instagram") ??
        accounts[0];
      await setSetting(KEYS.zAccount, fresh.id, user.id);
      if (fresh.username) await setSetting(KEYS.igUsername, fresh.username, user.id);
      await primeIg(user.id);
      return NextResponse.json({ ok: true, ...(await state(user.id)) });
    }

    // ── Zernio: one API key, no Meta app ─────────────────────────
    if (typeof body.zernioKey === "string" && body.zernioKey.trim()) {
      const key = body.zernioKey.trim();
      const check = await verifyZernio(key);
      if (!check.ok) {
        return NextResponse.json({ error: check.error ?? "Zernio rejected this key." }, {
          status: 400,
        });
      }
      const accounts = check.accounts ?? [];
      const want = String(body.accountId ?? "").trim();
      const chosen =
        accounts.find((a) => a.id === want) ??
        accounts.find((a) => (a.platform ?? "instagram") === "instagram") ??
        accounts[0];

      await setSetting(KEYS.zKey, key, user.id);
      await setSetting(KEYS.zAccount, chosen!.id, user.id);
      await setSetting(KEYS.igUsername, chosen!.username ?? null, user.id);
      await primeIg(user.id);

      return NextResponse.json({ ok: true, ...(await state()) });
    }

    // ── Meta Graph API (advanced) ────────────────────────────────
    const token = String(body.accessToken ?? "").trim();
    const userId = String(body.userId ?? "").trim();
    if (!token) {
      return NextResponse.json(
        { error: "Paste a Zernio API key — or a Meta access token below." },
        { status: 400 },
      );
    }

    const check = await verifyInstagram(token, userId || undefined);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? "Meta rejected these credentials." },
        { status: 400 },
      );
    }
    if (!check.userId && !userId) {
      return NextResponse.json(
        { error: check.error ?? "No Instagram business account found — paste the account id." },
        { status: 400 },
      );
    }

    await setSetting(KEYS.igToken, token, user.id);
    if (check.userId) await setSetting(KEYS.igUserId, check.userId, user.id);
    if (check.username) await setSetting(KEYS.igUsername, check.username, user.id);
    await primeIg(user.id);

    return NextResponse.json({ ok: true, ...(await state()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "link failed" },
      { status: 500 },
    );
  }
}

/** Unlink Instagram — publishes fall back to SIMULATED. */
export async function DELETE() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    for (const k of ALL_KEYS) await setSetting(k, null, user.id);
    await primeIg(user.id);
    return NextResponse.json({ ok: true, ...(await state(user.id)) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unlink failed" },
      { status: 500 },
    );
  }
}
