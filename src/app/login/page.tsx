"use client";

import { useEffect, useRef, useState } from "react";

type Stage = "email" | "code";

export default function LoginPage() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/");
  const codeRef = useRef<HTMLInputElement>(null);

  // read ?next= after mount — avoids useSearchParams/Suspense entirely
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("next");
    // same-origin page paths only — never /api/…, never protocol-relative
    if (p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/api/")) setNext(p);
  }, []);

  // Validate the session against the database rather than trusting a cookie.
  // If it is real, get out of the way; if it is stale, show the form instead
  // of bouncing between / and /login.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.user) return;
        const raw = new URLSearchParams(window.location.search).get("next");
        const safe =
          raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/api/")
            ? raw
            : "/";
        window.location.replace(safe);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    setError(null);
    setDevCode(null);
    try {
      const r = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "Could not send a code.");
        return;
      }
      setEmailed(Boolean(d.emailed));
      setDevCode(d.devCode ?? null);
      setStage("code");
      setCode("");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || code.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "That code didn't work.");
        return;
      }
      // Prove the browser kept the cookie before navigating — otherwise we
      // bounce straight back to /login with no explanation at all.
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (!me.ok) {
        setError(
          "Signed in, but your browser discarded the session cookie. Open this in a normal browser tab (not an embedded preview frame) and check the address starts with https://.",
        );
        return;
      }
      window.location.assign(next);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div
        aria-hidden="true"
        className="blob -left-40 -top-40 h-[520px] w-[520px] bg-[#0071e3]/22"
      />
      <div
        aria-hidden="true"
        className="blob -right-32 bottom-[-20%] h-[460px] w-[460px] bg-[#1f9d4a]/16"
        style={{ animationDelay: "-11s" }}
      />

      <div className="relative w-full max-w-[420px] animate-[rise_.55s_cubic-bezier(.22,.61,.36,1)_both]">
        <div className="mb-7 text-center">
          <div className="text-[40px] font-extrabold leading-none tracking-[-0.045em]">
            REELAY<span className="text-amber">.</span>
          </div>
          <div className="label mt-3">TT → IG relay console</div>
        </div>

        <div className="glass refract rounded-3xl border border-line p-6">
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.03em]">
            {stage === "email" ? "Enter your email" : "Enter your code"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            {stage === "email"
              ? "We'll send a one-time code — no password to remember or forget."
              : `We sent a6-digit code to ${email}. It expires in10 minutes.`}
          </p>

          {stage === "email" ? (
            <form onSubmit={sendCode} className="mt-5">
              <label className="label block" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl border border-line bg-sunken px-3.5 py-3 text-[15px] text-ink outline-none transition-all placeholder:text-muted/60 focus:border-amber focus:bg-panel focus:ring-4 focus:ring-amber/12"
              />
              <button
                type="submit"
                disabled={busy || !email}
                className="glass-cta mt-5 w-full rounded-xl py-3.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-5">
              <label className="label block" htmlFor="code">
                One-time code
              </label>
              <input
                id="code"
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="mt-2 w-full rounded-xl border border-line bg-sunken px-3.5 py-3 text-center font-mono text-[26px] tracking-[0.35em] tabular-nums text-ink outline-none transition-all placeholder:text-muted/40 focus:border-amber focus:bg-panel focus:ring-4 focus:ring-amber/12"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="glass-cta mt-5 w-full rounded-xl py-3.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Checking…" : "Sign in"}
              </button>

              <div className="mt-4 flex items-center justify-between text-[13px]">
                <button
                  type="button"
                  onClick={() => sendCode()}
                  disabled={busy}
                  className="font-semibold text-muted transition-colors hover:text-amber disabled:opacity-50"
                >
                  Send a new code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("email");
                    setCode("");
                    setDevCode(null);
                    setError(null);
                  }}
                  className="font-semibold text-muted transition-colors hover:text-amber"
                >
                  Change email
                </button>
              </div>
            </form>
          )}

          {devCode ? (
            <div className="mt-4 rounded-xl border border-fault/40 bg-fault/10 px-3.5 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-fault">
                Email not connected yet
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fault/90">
                Your code is{" "}
                <span className="font-mono text-[18px] tracking-[0.2em]">{devCode}</span>.
                Set <span className="font-mono">RESEND_API_KEY</span> and codes are emailed
                instead of shown here.
              </p>
            </div>
          ) : null}

          {!devCode && emailed && stage === "code" ? (
            <p className="mt-4 rounded-xl border border-onair/40 bg-onair/10 px-3.5 py-2.5 text-[13px] text-onair">
              Code sent — check your inbox.
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-xl border border-fault/30 bg-fault/10 px-3.5 py-2.5 text-[13px] text-fault">
              {error}
            </p>
          ) : null}
        </div>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-muted/80">
          No password. Codes expire in10 minutes and are single-use.
        </p>
      </div>
    </main>
  );
}
