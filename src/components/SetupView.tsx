"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, X, ArrowRight } from "lucide-react";
import { useConsole } from "./console-context";
import { SectionHead } from "./bits";

type TeleState = {
  telegram: { linked: boolean; handle: string; polling: boolean; webhook: string | null };
};

/** Matches GET /api/instagram exactly. */
type IgState = {
  provider: "zernio" | "graph" | null;
  instagram: {
    linked: boolean;
    source: string | null;
    username: string | null;
    userId: string | null;
    tokenTail: string | null;
  };
};

const STEPS: {
  n: string;
  title: string;
  why: string;
  link?: { label: string; href: string };
  check: (s: Status) => boolean | null;
  after: string;
}[] = [
  {
    n: "01",
    title: "Download your source code",
    why: "This preview URL dies. You need the code on GitHub to deploy it anywhere.",
    link: { label: "Download reelay-source.tar.gz", href: "/api/deploy-kit" },
    check: () => null,
    after: "Upload the files to a new repo at github.com/new (Add file → Upload files).",
  },
  {
    n: "02",
    title: "Create a free Postgres database",
    why: "Your schedule, captions and both tokens live in the database.",
    link: { label: "Open neon.tech", href: "https://neon.tech" },
    check: () => null,
    after: "Sign up with GitHub — no card. Create a project, copy the connection string.",
  },
  {
    n: "03",
    title: "Deploy to Render",
    why: "Render runs a real Node server from GitHub with no card.",
    link: { label: "Open render.com", href: "https://render.com" },
    check: () => null,
    after:
      "New → Web Service → connect your repo. Add env var DATABASE_URL with your Neon string. Deploy.",
  },
  {
    n: "04",
    title: "Create the database tables",
    why: "Two tables: videos (your clips) and settings (your tokens).",
    link: { label: "How (DEPLOY.md)", href: "https://github.com" },
    check: () => null,
    after: 'Run: DATABASE_URL="your-neon-string" npx drizzle-kit push',
  },
  {
    n: "05",
    title: "Link the Telegram bot",
    why: "So videos you send land in your inbox.",
    link: { label: "Go to /bot", href: "/bot" },
    check: (s) => s.tg?.linked ?? null,
    after: "Paste your token from @BotFather and tap Connect.",
  },
  {
    n: "06",
    title: "Link Instagram",
    why: "So reels actually publish — no Meta app needed.",
    link: { label: "Go to /ig", href: "/ig" },
    check: (s) => s.ig?.instagram.linked ?? null,
    after: "Paste your Zernio API key and tap Connect.",
  },
  {
    n: "07",
    title: "Turn the bot into a webhook",
    why: "Telegram pushes to you instead of you polling — works while the host sleeps.",
    link: { label: "Go to /bot", href: "/bot" },
    check: (s) => (s.tg?.webhook ? true : null),
    after: "On /bot, tap Turn on webhook.",
  },
  {
    n: "08",
    title: "Keep it awake with UptimeRobot",
    why: "Free hosts sleep after 15 min. A 5-minute ping wakes it and runs the scheduler.",
    link: { label: "Open uptimerobot.com", href: "https://uptimerobot.com" },
    check: () => null,
    after:
      "Add an HTTP(s) monitor pointing at https://your-app.onrender.com/api/tick, every 5 minutes.",
  },
];

type Status = { tg: TeleState["telegram"] | null; ig: IgState | null };

export default function SetupView() {
  const { env } = useConsole();
  const [tg, setTg] = useState<TeleState["telegram"] | null>(null);
  const [ig, setIg] = useState<IgState | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: TeleState) => setTg(d.telegram))
      .catch(() => undefined);
    fetch("/api/instagram")
      .then((r) => r.json())
      .then((d: IgState) => setIg(d))
      .catch(() => undefined);
  }, []);

  const status: Status = { tg, ig };
  const done = STEPS.filter((s) => s.check(status) === true).length;
  const auto = STEPS.filter((s) => s.check(status) !== null).length;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-6">
      <div className="border-b border-line pb-5">
        <div className="label">Go live</div>
        <h1 className="mt-2 max-w-[20ch] text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[54px]">
          Make it permanent, for free
        </h1>
        <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-muted">
          This preview is temporary. These eight steps move it to a free host that never asks for a
          card — and keep it awake so your scheduled posts go out on time.
        </p>
      </div>

      {auto > 0 ? (
        <div className="mt-5 flex items-center justify-between border border-line bg-panel/60 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {done} of {auto} checkable steps done
          </span>
          <span className="font-mono text-[20px] tabular-nums text-amber">
            {done}/{auto}
          </span>
        </div>
      ) : null}

      <div className="mt-6">
        <SectionHead num="12" title="The eight steps" />
        {STEPS.map((s) => {
          const res = s.check(status);
          const isDone = res === true;
          return (
            <div
              key={s.n}
              className="flex gap-4 border-b border-line px-1 py-4 last:border-b-0"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${
                  isDone
                    ? "bg-onair/20 text-onair"
                    : res === false
                      ? "bg-fault/20 text-fault"
                      : "border border-line text-muted"
                }`}
              >
                {isDone ? <Check size={13} /> : s.n}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold leading-tight">{s.title}</span>
                  {res === true ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-onair">
                      <Check size={11} /> done
                    </span>
                  ) : res === false ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-fault">
                      <X size={11} /> not yet
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.why}</p>

                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted/85">
                  <span className="text-amber">→ </span>
                  {s.after}
                </p>

                {s.link ? (
                  s.link.href.startsWith("http") ? (
                    <a
                      href={s.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-amber hover:text-amber"
                    >
                      {s.link.label} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <Link
                      href={s.link.href}
                      className="mt-2 inline-flex items-center gap-1.5 border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-amber hover:text-amber"
                    >
                      {s.link.label} <ArrowRight size={11} />
                    </Link>
                  )
                ) : null}

                {s.n === "08" && origin ? (
                  <code className="mt-2 block truncate border border-line bg-black/40 px-2.5 py-2 font-mono text-[11px] text-amber">
                    {origin}/api/tick
                  </code>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-7 border border-line bg-panel/60">
        <div className="label border-b border-line px-4 py-3">Your current status</div>
        {[
          ["App running", true, env ? "yes" : "checking…"],
          ["Scheduler", env?.scheduler === true, env?.schedulerError ?? "not running"],
          ["Telegram bot", Boolean(tg?.linked), tg?.handle ?? "not linked"],
          [
            "Instagram",
            Boolean(ig?.instagram.linked),
            ig?.provider ? `via ${ig.provider}` : "not linked",
          ],
          ["Bot mode", Boolean(tg?.webhook), tg?.webhook ? "webhook" : "long polling"],
        ].map(([label, ok, detail]) => (
          <div
            key={String(label)}
            className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              {label}
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px]">
              {ok ? (
                <>
                  <Check size={13} className="text-onair" />
                  <span className="truncate text-onair">{detail}</span>
                </>
              ) : (
                <>
                  <X size={13} className="text-fault" />
                  <span className="truncate text-muted">{detail}</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3 border border-line bg-black/30 p-4">
        <p className="text-[13px] leading-relaxed text-muted">
          Everything here is <span className="text-ink">free and needs no card</span>. The only
          trade is that free hosts sleep after 15 minutes — which is exactly what step 08 solves.
          Full detail in <span className="font-mono text-amber">FREE.md</span> and{" "}
          <span className="font-mono text-amber">DEPLOY.md</span> in the repo.
        </p>
      </div>
    </div>
  );
}
