"use client";

import Link from "next/link";
import { ArrowUpRight, Zap } from "lucide-react";
import { useConsole } from "./console-context";
import { Pill, SectionHead } from "./bits";
import { COVER_X, countdown, dateLabel, dur, hhmm } from "@/lib/ui";

const QUICK = [
  { label: "In 1h", ms: 3600_000 },
  { label: "In 3h", ms: 3 * 3600_000 },
  { label: "In 6h", ms: 6 * 3600_000 },
];

function tonightAt19(): string {
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function tomorrowAt9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export default function QueueView() {
  const { videos, now, queue, publish, setSelectedId, busy, flashId } = useConsole();

  const scheduled = videos
    .filter((v) => v.status === "scheduled" && v.scheduledAt)
    .sort((a, b) => +new Date(a.scheduledAt!) - +new Date(b.scheduledAt!));
  const waiting = videos.filter((v) => v.status === "ready" || v.status === "intake");
  const next = scheduled[0];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-6">
      {/* next post hero */}
      <div className="rise relative overflow-hidden border border-line bg-panel/70">
        <div className="grid gap-5 p-5 md:grid-cols-[130px_minmax(0,1fr)]">
          <div className="relative aspect-[9/16] w-[130px] overflow-hidden border border-line bg-black">
            {next ? (
              <>
                <img
                  src={next.coverImage ?? next.thumb}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{
                    objectPosition: next.coverImage
                      ? "50% 50%"
                      : `${COVER_X[next.coverFrame] ?? 40}% 50%`,
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              </>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-[10px] text-muted">
                EMPTY
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="label">Next to post</span>
                {next ? <Pill status={next.status} /> : null}
              </div>
              <h1 className="mt-2 text-[34px] font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-[44px]">
                {next ? next.title : "Nothing scheduled"}
              </h1>
              <p className="mt-2.5 max-w-[54ch] text-[13.5px] leading-relaxed text-muted">
                {next
                  ? next.caption.split("\n").filter(Boolean)[0]?.slice(0, 150) ||
                    "No caption yet — open it in the console to write one."
                  : "Open the console, pick a cover, write a caption and choose a time. It posts by itself."}
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-mono text-[40px] font-medium leading-none tabular-nums text-amber sm:text-[52px]">
                  {next?.scheduledAt
                    ? countdown(next.scheduledAt, now).replace("T-", "")
                    : "--:--:--"}
                </div>
                <div className="label mt-2">
                  {next?.scheduledAt
                    ? `${dateLabel(next.scheduledAt)} · ${hhmm(next.scheduledAt)} · ${
                        next.publishMode === "auto" ? "posts by itself" : "needs your confirmation"
                      }`
                    : "no time set"}
                </div>
              </div>
              <div className="flex gap-2">
                {next ? (
                  <>
                    <button
                      type="button"
                      onClick={() => publish(next.id)}
                      disabled={busy}
                      className="sheen flex items-center gap-2 bg-amber px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#101216] transition-all hover:bg-[#ffc355] active:translate-y-px disabled:opacity-50"
                    >
                      <Zap size={13} /> Post now
                    </button>
                    <Link
                      href="/"
                      onClick={() => setSelectedId(next.id)}
                      className="flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink transition-colors hover:border-amber hover:text-amber"
                    >
                      Edit <ArrowUpRight size={13} />
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* scheduled */}
      <div className="mt-7">
        <SectionHead
          num="02"
          title="Scheduled"
          right={
            <span className="font-mono text-[10px] tabular-nums text-muted">
              {String(scheduled.length).padStart(2, "0")} WAITING
            </span>
          }
        />

        <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-3 border-b border-line bg-black/30 px-3 py-2">
          <span className="label">Time</span>
          <span className="label">Video</span>
          <span className="label">Actions</span>
        </div>

        {scheduled.length === 0 ? (
          <div className="border-b border-line px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            Nothing scheduled yet
          </div>
        ) : (
          scheduled.map((v) => (
            <div
              key={v.id}
              className={`lift grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 ${
                flashId === v.id ? "animate-[stamp_.4s_ease-out]" : "hover:bg-panel"
              }`}
            >
              <div>
                <div className="font-mono text-[15px] leading-none tabular-nums text-amber">
                  {hhmm(v.scheduledAt)}
                </div>
                <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  {dateLabel(v.scheduledAt)}
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={v.coverImage ?? v.thumb}
                  alt=""
                  className="h-12 w-9 shrink-0 border border-line object-cover"
                  style={{
                    objectPosition: v.coverImage ? "50% 50%" : `${COVER_X[v.coverFrame] ?? 40}% 50%`,
                  }}
                />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold leading-tight">{v.title}</div>
                  <div className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    {dur(v.durationSec)} · {v.publishMode === "auto" ? "auto-post" : "ask me first"} ·{" "}
                    {countdown(v.scheduledAt!, now)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => publish(v.id)}
                  disabled={busy}
                  className="border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink transition-colors hover:border-onair hover:text-onair disabled:opacity-50"
                >
                  Post
                </button>
                <button
                  type="button"
                  onClick={() => queue(v.id, null)}
                  className="border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-fault hover:text-fault"
                >
                  Unschedule
                </button>
                <Link
                  href="/"
                  onClick={() => setSelectedId(v.id)}
                  className="border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber hover:text-amber"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* not scheduled */}
      <div className="mt-7">
        <SectionHead
          num="03"
          title="Waiting for a time"
          right={
            <span className="font-mono text-[10px] tabular-nums text-muted">
              {String(waiting.length).padStart(2, "0")} VIDEOS
            </span>
          }
        />

        {waiting.length === 0 ? (
          <div className="border-b border-line px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            Every video has a time
          </div>
        ) : (
          waiting.map((v) => (
            <div
              key={v.id}
              className="lift flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={v.coverImage ?? v.thumb}
                  alt=""
                  className="h-12 w-9 shrink-0 border border-line object-cover"
                  style={{
                    objectPosition: v.coverImage ? "50% 50%" : `${COVER_X[v.coverFrame] ?? 40}% 50%`,
                  }}
                />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold leading-tight">{v.title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Pill status={v.status} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      {dur(v.durationSec)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => queue(v.id, new Date(Date.now() + q.ms).toISOString())}
                    className="border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber hover:text-amber"
                  >
                    {q.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => queue(v.id, tonightAt19())}
                  className="border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber hover:text-amber"
                >
                  Tonight 19:00
                </button>
                <button
                  type="button"
                  onClick={() => queue(v.id, tomorrowAt9())}
                  className="border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber hover:text-amber"
                >
                  Tomorrow 09:00
                </button>
                <Link
                  href="/"
                  onClick={() => setSelectedId(v.id)}
                  className="border border-amber/60 bg-amber/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-amber transition-colors hover:bg-amber hover:text-[#101216]"
                >
                  Open in console
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
