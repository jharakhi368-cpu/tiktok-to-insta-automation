"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Link2, Plug, RefreshCw, Unplug, Zap } from "lucide-react";
import { useConsole } from "./console-context";
import { SectionHead } from "./bits";
import { COVER_X } from "@/lib/ui";

type IgState = {
  provider: "zernio" | "graph" | null;
  instagram: {
    linked: boolean;
    source: string | null;
    username: string | null;
    userId: string | null;
    tokenTail: string | null;
    zernio: { linked: boolean; accountId: string | null; keyTail: string | null };
  };
};

const Z_STEPS = [
  { n: "01", t: "Sign up at zernio.com", d: "Connect your Instagram account — one key covers every post." },
  { n: "02", t: "Connect Instagram in Zernio", d: "One click inside their dashboard. No Meta app, no OAuth, no app review." },
  { n: "03", t: "Create an API key", d: "Zernio → Settings → API keys → copy it (it starts with sk_)." },
  { n: "04", t: "Paste it below", d: "REELAY lists your connected accounts and picks the Instagram one automatically." },
];

const SPEC = [
  ["Call", "One POST /v1/posts — no container polling"],
  ["Format", "Reel · 9:16 · MP4/MOV · caption to 2200"],
  ["Cover", "Scrubbed frame or your own upload"],
  ["Cross-post", "Optional share to Instagram feed"],
  ["Scheduling", "Handled by REELAY's own air-time clock"],
  ["Without a key", "Posts are marked SIMULATED, never faked"],
];

export default function IgView() {
  const { notify, env } = useConsole();
  const [state, setState] = useState<IgState | null>(null);
  const [zKey, setZKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [gToken, setGToken] = useState("");
  const [gUser, setGUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    fetch("/api/instagram")
      .then((r) => r.json())
      .then((d: IgState) => setState(d))
      .catch(() => undefined);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(showGraph ? { accessToken: gToken, userId: gUser } : { zernioKey: zKey }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? "Link failed");
        return;
      }
      setState(d);
      setZKey("");
      setGToken("");
      notify(
        d.provider === "zernio"
          ? `Instagram linked via Zernio — ${d.instagram.userId ?? "account connected"}`
          : "Instagram linked via the Meta Graph API",
      );
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/instagram", { method: "DELETE" });
      setState(await r.json());
      notify("Instagram unlinked — posts go back to SIMULATED");
    } finally {
      setBusy(false);
    }
  };

  const ig = state?.instagram;
  const linked = Boolean(ig?.linked);
  const viaZernio = state?.provider === "zernio";

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-6">
      <div className="border-b border-line pb-5">
        <div className="label">09 · Connection</div>
        <h1 className="mt-2 max-w-[20ch] text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[54px]">
          Link your Instagram
        </h1>
        <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-muted">
          No Meta developer app, no OAuth flow, no app review. Zernio is a single API key that
          publishes Reels straight to your account — REELAY calls it once per post and handles the
          air time itself.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <SectionHead
            num="10"
            title="Zernio · recommended"
            right={
              <span
                className={`text-[12px] font-semibold tracking-[0.01em] ${
                  ig?.zernio.linked ? "text-onair" : "text-amber"
                }`}
              >
                {ig?.zernio.linked ? "LINKED" : "NOT LINKED"}
              </span>
            }
          />

          <ol className="border-b border-line">
            {Z_STEPS.map((s) => (
              <li key={s.n} className="flex gap-4 border-b border-line px-1 py-3.5 last:border-b-0">
                <span className="font-mono text-[11px] leading-5 text-amber">{s.n}</span>
                <span>
                  <span className="block text-[13.5px] font-semibold leading-5">{s.t}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>

          <form onSubmit={link} className="mt-5">
            <label className="label" htmlFor="z-key">
              Zernio API key
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <input
                  id="z-key"
                  type={reveal ? "text" : "password"}
                  value={zKey}
                  onChange={(e) => setZKey(e.target.value)}
                  placeholder="sk_…"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={showGraph}
                  className="w-full border border-line bg-sunken px-3 py-2.5 pr-10 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-amber disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? "Hide key" : "Show key"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted transition-colors hover:text-amber"
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={busy || !zKey.trim()}
                className="flex items-center gap-2 bg-amber px-5 py-2.5 text-[13px] font-semibold tracking-[-0.01em] text-white transition-all hover:bg-[#0059c7] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plug size={13} /> {busy ? "Checking…" : "Connect"}
              </button>
            </div>
            <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
              Get one at zernio.com → Settings → API keys
            </p>

            {err ? (
              <p className="mt-3 border-l-2 border-fault bg-fault/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-fault">
                {err}
              </p>
            ) : null}
          </form>

          {/* status */}
          <div className="mt-5 border border-line rounded-2xl bg-panel/60 p-4">
            <div className="flex items-center justify-between">
              <span className="label">Connection</span>
              <span
                className={`flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] ${
                  linked ? "text-onair" : "text-amber"
                }`}
              >
                <span
                  className={`h-[7px] w-[7px] rounded-full ${
                    linked
                      ? "bg-onair shadow-[0_0_6px_rgba(123,216,143,.8)] animate-[ledblink_2s_ease-in-out_infinite]"
                      : "bg-amber"
                  }`}
                />
                {linked ? (viaZernio ? "Publishing via Zernio" : "Publishing via Graph") : "Simulated mode"}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 font-mono text-[12px]">
              <dt className="text-muted">Provider</dt>
              <dd className="uppercase text-ink">
                {state?.provider === "zernio" ? "Zernio" : state?.provider === "graph" ? "Meta Graph API" : "—"}
              </dd>
              <dt className="text-muted">Account</dt>
              <dd className="truncate text-ink">
                {ig?.username ? `@${ig.username}` : ig?.userId ?? "—"}
              </dd>
              <dt className="text-muted">Key</dt>
              <dd className="text-ink">{ig?.tokenTail ?? "—"}</dd>
              <dt className="text-muted">Source</dt>
              <dd className="uppercase text-ink">
                {ig?.source === "zernio"
                  ? "Zernio key"
                  : ig?.source === "console"
                    ? "Saved in console"
                    : ig?.source === "env"
                      ? "Environment variable"
                      : "—"}
              </dd>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    const r = await fetch("/api/instagram", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "refresh" }),
                    });
                    const d = await r.json();
                    if (!r.ok) {
                      setErr(d.error ?? "Refresh failed");
                      return;
                    }
                    setState(d);
                    notify("Account id refreshed from Zernio");
                  } catch {
                    setErr("Could not reach the server.");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy || !ig?.zernio.linked}
                className="flex items-center gap-2 border border-line px-3 py-2 text-[12px] font-semibold tracking-[0.01em] text-muted transition-colors hover:border-amber hover:text-amber disabled:opacity-40"
              >
                <RefreshCw size={12} /> Refresh account id
              </button>
              <button
                type="button"
                onClick={unlink}
                disabled={busy || !linked}
                className="flex items-center gap-2 border border-line px-3 py-2 text-[12px] font-semibold tracking-[0.01em] text-muted transition-colors hover:border-fault hover:text-fault disabled:opacity-40"
              >
                <Unplug size={12} /> Unlink
              </button>
              <span className="flex items-center gap-2 px-1 text-[12px] font-semibold tracking-[0.01em] text-muted">
                <Link2 size={12} /> key stored in Postgres, never in the browser
              </span>
            </div>
          </div>

          {/* advanced: graph */}
          <details
            open={showGraph}
            onToggle={(e) => setShowGraph((e.target as HTMLDetailsElement).open)}
            className="mt-5 border border-line bg-sunken"
          >
            <summary className="cursor-pointer list-none border-b border-line px-4 py-3 text-[13px] font-semibold tracking-[-0.01em] text-muted transition-colors hover:text-amber">
              Advanced · use the Meta Graph API instead
            </summary>
            <div className="p-4">
              <p className="text-[12.5px] leading-relaxed text-muted">
                Only needed if you want first-comment hashtags posted natively. Requires a Meta
                developer app, an Instagram professional account and app review.
              </p>
              <label className="label mt-4 block" htmlFor="g-token">
                Long-lived access token
              </label>
              <input
                id="g-token"
                type="password"
                value={gToken}
                onChange={(e) => setGToken(e.target.value)}
                placeholder="EAAG…"
                autoComplete="off"
                className="mt-2 w-full border border-line bg-sunken px-3 py-2.5 font-mono text-[13px] text-ink outline-none focus:border-amber"
              />
              <label className="label mt-4 block" htmlFor="g-user">
                Instagram business account id <span className="text-muted/60">(optional)</span>
              </label>
              <input
                id="g-user"
                type="text"
                value={gUser}
                onChange={(e) => setGUser(e.target.value)}
                placeholder="17841400000000000"
                autoComplete="off"
                className="mt-2 w-full border border-line bg-sunken px-3 py-2.5 font-mono text-[13px] text-ink outline-none focus:border-amber"
              />
              <button
                type="button"
                onClick={link}
                disabled={busy || !gToken.trim()}
                className="mt-4 flex items-center gap-2 border border-line px-4 py-2.5 text-[13px] font-semibold tracking-[-0.01em] text-ink transition-colors hover:border-amber hover:text-amber disabled:opacity-40"
              >
                <Zap size={13} /> Connect via Graph
              </button>
            </div>
          </details>
        </div>

        {/* right rail */}
        <div>
          <SectionHead num="11" title="What goes out" />

          <div className="mt-4 border border-line rounded-2xl bg-panel/60 p-3">
            <div className="mx-auto w-[150px]">
              <div className="relative aspect-[9/16] overflow-hidden border border-line bg-black">
                <img
                  src="/images/v1.jpg"
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ objectPosition: `${COVER_X[2]}% 50%` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/40" />
                <div className="absolute inset-x-0 bottom-0 p-2.5">
                  <div className="font-mono text-[9px] tracking-[0.1em] text-amber">
                    @{ig?.username ?? "yourhandle"}
                  </div>
                  <div className="mt-1 line-clamp-3 text-[12px] leading-snug text-white">
                    30 seconds of fire. The wok never sleeps. 🍳
                  </div>
                </div>
                <span className="absolute left-1.5 top-1.5 bg-black/70 px-1.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-amber">
                  Reel · 9:16
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="label">Preview</span>
              <span
                className={`text-[12px] font-semibold tracking-[0.01em] ${
                  linked ? "text-onair" : "text-amber"
                }`}
              >
                {linked ? "LIVE" : "SIMULATED"}
              </span>
            </div>
          </div>

          <div className="mt-5 border border-line rounded-2xl bg-panel/60">
            <div className="label border-b border-line px-3 py-2.5">Publish spec</div>
            {SPEC.map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
                  {k}
                </span>
                <span className="text-right text-[12.5px] text-ink">{v}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-3 border border-line bg-sunken p-3">
            <Link2 size={14} className="mt-0.5 shrink-0 text-amber" />
            <p className="text-[12.5px] leading-relaxed text-muted">
              Scheduler, bot and credentials live in this one service — once it is hosted, posts go
              out on time whether or not you have the console open.
              {env?.uptimeMs ? ` This instance has been up ${Math.floor(env.uptimeMs / 60000)} min.` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
