"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Mail, Eye, EyeOff } from "lucide-react";
import { useConsole } from "./console-context";
import { SectionHead } from "./bits";

type Me = { user: { id: string; email: string } | null };
type EmailState = { configured: boolean; source: "stored" | "env" | null };

export default function SettingsView() {
  const { notify } = useConsole();
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [state, setState] = useState<EmailState>({ configured: false, source: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : ({ user: null } as Me)))
      .then((d) => setEmail(d.user?.email ?? null))
      .catch(() => undefined);

    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.email) setState(d.email);
      })
      .catch(() => undefined);
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "email", apiKey: key.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        notify(d.error ?? "Could not save");
        return;
      }
      setState({ configured: Boolean(d.configured), source: d.configured ? "stored" : null });
      setKey("");
      notify(d.configured ? "Email delivery connected" : "Email key removed");
    } catch {
      notify("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-6">
      <div className="border-b border-line pb-5">
        <div className="label">Account</div>
        <h1 className="mt-2 text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[54px]">
          Settings
        </h1>
      </div>

      {/* ── account ─────────────────────────────────── */}
      <div className="mt-6">
        <SectionHead num="13" title="Signed in" />
        <div className="glass mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line p-4">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{email ?? "…"}</div>
            <div className="mt-1 text-[12.5px] text-muted">
              Passwordless — sign-in uses a one-time email code.
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
              router.replace("/login");
              router.refresh();
            }}
            className="rounded-xl border border-line px-4 py-2.5 font-mono text-[11px] text-muted transition-colors hover:border-fault hover:text-fault"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* ── email delivery ─────────────────────────── */}
      <div className="mt-7">
        <SectionHead
          num="14"
          title="Email delivery"
          right={
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                state.configured ? "text-onair" : "text-amber"
              }`}
            >
              {state.configured ? "Connected" : "Not connected"}
            </span>
          }
        />

        <div className="glass mt-4 rounded-2xl border border-line p-4">
          <p className="text-[13.5px] leading-relaxed text-muted">
            {state.configured ? (
              <>
                Sign-in codes are emailed with{" "}
                <Check size={13} className="inline text-onair" /> — they no longer appear
                on the login screen.
              </>
            ) : (
              <>
                Codes are currently <b className="text-ink">shown on the login screen</b>{" "}
                because no email provider is connected. Paste a Resend API key below and
                they go to the inbox instead.
              </>
            )}
          </p>

          <form onSubmit={save} className="mt-4">
            <label className="label block" htmlFor="resend">
              Resend API key
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  id="resend"
                  type={reveal ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="re_…"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-xl border border-line bg-sunken px-3.5 py-3 pr-10 font-mono text-[13px] text-ink outline-none transition-all placeholder:text-muted/50 focus:border-amber focus:bg-panel focus:ring-4 focus:ring-amber/12"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? "Hide key" : "Show key"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted transition-colors hover:text-amber"
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={busy || (!key.trim() && !state.configured)}
                className="glass-cta shrink-0 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-amber"
            >
              Get a free key at resend.com <ExternalLink size={12} />
            </a>
            <span className="text-[12px] text-muted/70">
              free tier, no card —100 emails/day
            </span>
          </div>

          <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted/85">
            <Mail size={14} className="mt-0.5 shrink-0 text-muted" />
            Set{" "}
            <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11.5px]">
              RESEND_API_KEY
            </code>{" "}
            on the host instead if you prefer environment variables — either works.
          </p>
        </div>
      </div>
    </div>
  );
}
