"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/");

  // read ?next= after mount — avoids useSearchParams/Suspense entirely
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("next");
    if (p && p.startsWith("/") && !p.startsWith("//")) setNext(p);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/auth/${mode === "signin" ? "login" : "signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "Something went wrong.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      {/* ambient colour the glass refracts */}
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

        <form
          onSubmit={submit}
          className="glass refract rounded-3xl border border-line p-6"
        >
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.03em]">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            {mode === "signin"
              ? "Your clips, captions and keys are private to this account."
              : "Your first account also picks up anything already in the workspace."}
          </p>

          <label className="label mt-5 block" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2 w-full rounded-xl border border-line bg-sunken px-3.5 py-3 text-[15px] text-ink outline-none transition-all placeholder:text-muted/60 focus:border-amber focus:bg-panel focus:ring-4 focus:ring-amber/12"
          />

          <label className="label mt-4 block" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "signin" ? "••••••••" : "At least 8 characters"}
            className="mt-2 w-full rounded-xl border border-line bg-sunken px-3.5 py-3 text-[15px] text-ink outline-none transition-all placeholder:text-muted/60 focus:border-amber focus:bg-panel focus:ring-4 focus:ring-amber/12"
          />

          {error ? (
            <p className="mt-4 rounded-xl border border-fault/30 bg-fault/10 px-3.5 py-2.5 text-[13px] text-fault">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="glass-cta mt-5 w-full rounded-xl py-3.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="mt-4 w-full text-center text-[13.5px] font-semibold text-muted transition-colors hover:text-amber"
          >
            {mode === "signin"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] leading-relaxed text-muted/80">
          Passwords are stored as scrypt hashes. Sessions expire after 30 days.
        </p>
      </div>
    </main>
  );
}
