"use client";

import { ArrowRight } from "lucide-react";
import type { Env, VideoDTO } from "@/lib/types";
import { hhmmss } from "@/lib/ui";

function Led({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-[7px] w-[7px] rounded-full ${
          on
            ? "bg-onair shadow-[0_0_6px_rgba(123,216,143,.8)] animate-[ledblink_2s_ease-in-out_infinite]"
            : "bg-fault/70"
        }`}
      />
      <span className="label">{label}</span>
    </div>
  );
}

function Channel({
  name,
  dot,
  sub,
  state,
  ok,
}: {
  name: string;
  dot: string;
  sub: string;
  state: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 border border-line bg-black/45 px-3 py-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
          {name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">{sub}</span>
      </span>
      <span
        className={`ml-1 font-mono text-[9px] uppercase tracking-[0.14em] ${
          ok ? "text-onair" : "text-amber"
        }`}
      >
        {state}
      </span>
    </div>
  );
}

function uptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0
    ? `${h}h${String(m).padStart(2, "0")}m`
    : `${m}m${String(s % 60).padStart(2, "0")}s`;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-right">
      <div
        className={`font-mono text-[20px] font-medium leading-none tabular-nums ${
          tone === "amber" ? "text-amber" : tone === "green" ? "text-onair" : "text-ink"
        }`}
      >
        {String(value).padStart(2, "0")}
      </div>
      <div className="label mt-1.5">{label}</div>
    </div>
  );
}

export default function StatusBar({
  now,
  env,
  videos,
  fault,
}: {
  now: Date;
  env: Env | null;
  videos: VideoDTO[];
  fault: string | null;
}) {
  const armed = videos.filter((v) => v.status === "scheduled" || v.status === "publishing").length;
  const posted = videos.filter((v) => v.status === "published").length;
  const intake = videos.filter((v) => v.status === "intake" || v.status === "ready").length;

  return (
    <header className="grain relative shrink-0 overflow-hidden border-b border-line">
      <img
        src="images/rack.jpg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-base via-base/92 to-base/55" />

      <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-5 px-5 py-4">
        <div className="flex items-end gap-5">
          <div>
            <div className="text-[34px] font-extrabold leading-[0.82] tracking-[-0.045em]">
              REELAY<span className="text-amber">.</span>
            </div>
            <div className="label mt-2.5">TT → IG RELAY CONSOLE</div>
          </div>

          <div className="hidden items-center gap-3 pb-1 md:flex">
            <Channel
              name="Telegram"
              dot="bg-tg"
              sub={env?.botHandle ?? "@reelay_bot"}
              state={env?.bot ? "LINKED" : "NO TOKEN"}
              ok={Boolean(env?.bot)}
            />
            <ArrowRight size={14} className="shrink-0 text-amber" />
            <Channel
              name="Instagram"
              dot="bg-ig"
              sub="GRAPH API · REELS"
              state={env?.instagram ? "LINKED" : "SIM MODE"}
              ok={Boolean(env?.instagram)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Stat label="Scheduled" value={armed} tone="amber" />
          <Stat label="Posted" value={posted} tone="green" />
          <Stat label="Inbox" value={intake} tone="grey" />
          <div className="flex flex-col gap-2 pb-1">
            <Led label="Scheduler" on={Boolean(env?.scheduler)} />
            <Led label="Bot" on={Boolean(env?.bot)} />
          </div>
          <div className="border-l border-line pb-1 pl-5 text-right">
            <div className="font-mono text-[26px] font-medium leading-none tabular-nums">
              {hhmmss(now)}
            </div>
            <div className="label mt-2 flex items-center justify-end gap-3">
              <span>{env?.tz ?? "LOCAL TIME"}</span>
              <span className="text-onair">UP {uptime(env?.uptimeMs ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {fault ? (
        <div className="relative border-t border-fault/40 bg-fault/10 px-5 py-1.5 font-mono text-[11px] text-fault">
          {fault}
        </div>
      ) : null}
    </header>
  );
}
