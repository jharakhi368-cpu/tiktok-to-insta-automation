"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Link2, Plug, Unplug } from "lucide-react";
import { useConsole } from "./console-context";
import { SectionHead } from "./bits";

type TeleState = {
  telegram: {
    linked: boolean;
    source: string | null;
    handle: string;
    chatId: string | null;
    polling: boolean;
    tokenTail: string | null;
    webhook: string | null;
  };
};

const STEPS = [
  { n: "01", t: "Open @BotFather in Telegram", d: "Send /newbot and follow the prompts." },
  { n: "02", t: "Name it and give it a username", d: "Something like reelay_official_bot." },
  { n: "03", t: "Copy the token", d: "It looks like 123456789:AAF4kd… — keep it private." },
  { n: "04", t: "Paste it below", d: "REELAY validates it with Telegram and starts polling." },
];

/** Step 1 of the wizard — exactly what the bot sends when a video lands. */
const DEMO_BUTTONS = [
  ["1 · Pick the cover"],
  ["✅ Use this cover", "🗑 Delete"],
  ["🖼 Upload my cover"],
];

/** The four steps, in order, as the bot walks them. */
const WIZARD_STEPS = [
  ["1", "Pick the cover", "Original first — or send your own image"],
  ["2", "Write the caption", "Send the text, or tap Save caption"],
  ["3", "When should it go out?", "Schedule post or Post now"],
  ["4", "Posted", "Confirmation with the time and media id"],
];

const COMMANDS = [
  ["/start", "Home — the four steps and live counts"],
  ["/reels", "Your videos (the console inbox)"],
  ["/queue", "Scheduled + waiting for a time"],
  ["/posted", "Feed history, with Clear history"],
  ["/settings", "Bot status and connection"],
];

export default function BotView() {
  const { notify, env } = useConsole();
  const [state, setState] = useState<TeleState | null>(null);
  const [token, setToken] = useState("");
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: TeleState) => setState(d))
      .catch(() => undefined);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? "Link failed");
        return;
      }
      setState(d);
      setToken("");
      notify(`Bot linked — ${d.telegram.handle}`);
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/settings", { method: "DELETE" });
      const d = await r.json();
      setState(d);
      notify("Bot unlinked");
    } finally {
      setBusy(false);
    }
  };

  const tg = state?.telegram;
  const linked = Boolean(tg?.linked);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-6">
      <div className="border-b border-line pb-5">
        <div className="label">06 · Connection</div>
        <h1 className="mt-2 max-w-[16ch] text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[54px]">
          Link your Telegram bot
        </h1>
        <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-muted">
          Paste the token @BotFather gave you. It is stored in the database (not in your code),
          validated against Telegram, and the poller starts the moment you connect — every REELAY
          feature then arrives in your chat as a button.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <SectionHead num="07" title="Link token" />

          <ol className="border-b border-line">
            {STEPS.map((s) => (
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
            <label className="label" htmlFor="bot-token">
              Bot token
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <input
                  id="bot-token"
                  type={reveal ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="123456789:AAF4kdjskdnfldksjf…"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full border border-line bg-black/40 px-3 py-2.5 pr-10 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-amber"
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? "Hide token" : "Show token"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted transition-colors hover:text-amber"
                >
                  {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={busy || !token.trim()}
                className="flex items-center gap-2 bg-amber px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#101216] transition-all hover:bg-[#ffc355] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plug size={13} /> {busy ? "Checking…" : "Connect"}
              </button>
            </div>
            {err ? (
              <p className="mt-2 border-l-2 border-fault bg-fault/10 px-3 py-2 font-mono text-[11px] text-fault">
                {err}
              </p>
            ) : null}
          </form>

          {/* status */}
          <div className="mt-5 border border-line bg-panel/60 p-4">
            <div className="flex items-center justify-between">
              <span className="label">Connection</span>
              <span
                className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] ${
                  linked ? (tg?.polling ? "text-onair" : "text-amber") : "text-fault"
                }`}
              >
                <span
                  className={`h-[7px] w-[7px] rounded-full ${
                    linked && tg?.polling
                      ? "bg-onair shadow-[0_0_6px_rgba(123,216,143,.8)] animate-[ledblink_2s_ease-in-out_infinite]"
                      : linked
                        ? "bg-amber"
                        : "bg-fault/70"
                  }`}
                />
                {!linked ? "Not linked" : tg?.polling ? "Polling live" : "Starting…"}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 font-mono text-[12px]">
              <dt className="text-muted">Handle</dt>
              <dd className="truncate text-ink">{tg?.handle ?? env?.botHandle ?? "@reelay_bot"}</dd>
              <dt className="text-muted">Source</dt>
              <dd className="uppercase text-ink">
                {tg?.source === "console"
                  ? "Saved in console"
                  : tg?.source === "env"
                    ? "Environment variable"
                    : "—"}
              </dd>
              <dt className="text-muted">Token</dt>
              <dd className="text-ink">{tg?.tokenTail ?? "—"}</dd>
              <dt className="text-muted">Chat id</dt>
              <dd className="truncate text-ink">{tg?.chatId ?? "waiting for first message"}</dd>
              <dt className="text-muted">Mode</dt>
              <dd className="truncate text-ink">
                {tg?.webhook ? (
                  <span className="text-onair">Webhook — works while the host sleeps</span>
                ) : (
                  <span className="text-amber">Long polling — needs a live process</span>
                )}
              </dd>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={webhookBusy || !linked}
                onClick={async () => {
                  setWebhookBusy(true);
                  try {
                    const r = await fetch("/api/settings", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(
                        tg?.webhook
                          ? { action: "webhook", url: null }
                          : { action: "webhook", url: window.location.origin },
                      ),
                    });
                    const d = await r.json();
                    if (!r.ok) {
                      notify(d.error ?? "Could not switch mode");
                      return;
                    }
                    notify(
                      d.mode === "webhook"
                        ? "Webhook on — Telegram now pushes to this app"
                        : "Long polling on",
                    );
                    await load();
                  } finally {
                    setWebhookBusy(false);
                  }
                }}
                className={`flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors disabled:opacity-40 ${
                  tg?.webhook
                    ? "border-onair/60 text-onair hover:border-onair"
                    : "border-line text-muted hover:border-onair hover:text-onair"
                }`}
              >
                {webhookBusy
                  ? "Switching…"
                  : tg?.webhook
                    ? "Webhook on — switch to polling"
                    : "Turn on webhook"}
              </button>
              <button
                type="button"
                onClick={unlink}
                disabled={busy || !linked}
                className="flex items-center gap-2 border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-fault hover:text-fault disabled:opacity-40"
              >
                <Unplug size={12} /> Unlink
              </button>
              <span className="flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <Link2 size={12} /> stored in the settings table
              </span>
            </div>
          </div>
        </div>

        {/* telegram preview */}
        <div>
          <SectionHead num="08" title="What the bot sends" />

          <div className="mt-4 overflow-hidden border border-line bg-[#0e1621] p-3">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#5288c1] font-mono text-[11px] text-white">
                R
              </div>
              <div>
                <div className="font-mono text-[12px] text-[#e9eef4]">
                  {tg?.handle ?? "@reelay_bot"}
                </div>
                <div className="font-mono text-[9.5px] text-[#6d7f8f]">bot</div>
              </div>
            </div>

            <div className="mt-3 max-w-[300px] rounded-[10px] rounded-tl-none bg-[#182533] px-3 py-2.5">
              <div className="text-[13px] leading-snug text-[#e9eef4]">
                🎬 <b>Midnight wok — 30 second pad kra pao</b>
              </div>
              <div className="mt-1 text-[13px] leading-snug text-[#8fa3b5]">
                1 · Pick the cover
                <br />
                The original cover from the video is showing now.
              </div>
            </div>

            <div className="mt-2 grid max-w-[300px] gap-[3px] rounded-[10px] bg-[#182533] p-[3px]">
              {DEMO_BUTTONS.map((row, i) => (
                <div key={i} className="grid grid-cols-2 gap-[3px]">
                  {row.map((b) => (
                    <div
                      key={b}
                      className="truncate bg-[#2b4256] px-2 py-2 text-center text-[12px] text-[#8ec2f2] transition-colors hover:bg-[#375068]"
                    >
                      {b}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#6d7f8f]">
              sent the moment a video lands
            </div>
          </div>

          <div className="mt-5 border border-line bg-panel/60">
            <div className="label border-b border-line px-3 py-2.5">
              The four steps, one at a time
            </div>
            {WIZARD_STEPS.map(([n, title, sub]) => (
              <div
                key={n}
                className="flex gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <span className="font-mono text-[11px] leading-5 text-amber">{n}</span>
                <span>
                  <span className="block text-[13px] font-semibold leading-5">{title}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                    {sub}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 border border-line bg-panel/60">
            <div className="label border-b border-line px-3 py-2.5">Commands</div>
            {COMMANDS.map(([cmd, desc]) => (
              <div
                key={cmd}
                className="flex items-baseline gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
              >
                <code className="font-mono text-[12px] text-amber">{cmd}</code>
                <span className="text-[12px] text-muted">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
