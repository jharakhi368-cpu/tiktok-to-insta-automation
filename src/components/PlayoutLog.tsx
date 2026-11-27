"use client";

import type { Env, VideoDTO } from "@/lib/types";
import { countdown, dateLabel, dur, hhmm } from "@/lib/ui";
import { Pill, SectionHead } from "./bits";

function Row({
  v,
  selected,
  flash,
  onSelect,
}: {
  v: VideoDTO;
  selected: boolean;
  flash: boolean;
  onSelect: (id: string) => void;
}) {
  const isPast = v.status === "published" || v.status === "failed";
  const stamp = isPast ? v.publishedAt ?? v.createdAt : v.scheduledAt ?? v.createdAt;
  return (
    <button
      type="button"
      onClick={() => onSelect(v.id)}
      title={v.error ?? v.caption.slice(0, 120)}
      className={`grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line px-4 py-2.5 text-left transition-colors ${
        flash ? "animate-[stamp_.4s_ease-out]" : ""
      } ${selected ? "bg-raise" : "hover:bg-panel"}`}
    >
      <span
        className={`font-mono text-[12px] tabular-nums ${
          isPast ? "text-muted" : "text-amber"
        }`}
      >
        {hhmm(stamp)}
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-[12.5px] leading-tight ${
            isPast ? "text-muted" : "text-ink"
          }`}
        >
          {v.title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted/85">
          {dateLabel(stamp)} · {dur(v.durationSec)} · {v.publishMode === "auto" ? "AUTO" : "MANUAL"}
          {v.status === "failed" && v.error ? ` · ${v.error}` : ""}
        </span>
      </span>
      <Pill status={v.status} />
    </button>
  );
}

export default function PlayoutLog({
  videos,
  now,
  selectedId,
  onSelect,
  flashId,
  tickAt,
  env,
}: {
  videos: VideoDTO[];
  now: Date;
  selectedId: string | null;
  onSelect: (id: string) => void;
  flashId: string | null;
  tickAt: string | null;
  env: Env | null;
}) {
  const upcoming = videos
    .filter((v) => (v.status === "scheduled" || v.status === "publishing") && v.scheduledAt)
    .sort((a, b) => +new Date(a.scheduledAt!) - +new Date(b.scheduledAt!));

  const history = videos
    .filter((v) => v.status === "published" || v.status === "failed")
    .sort(
      (a, b) =>
        +new Date(b.publishedAt ?? b.createdAt) - +new Date(a.publishedAt ?? a.createdAt),
    );

  const next = upcoming[0];

  return (
    <>
      <SectionHead
        num="04"
        title="Schedule"
        right={
          <span
            className={`font-mono text-[11px] tabular-nums ${
              next ? "text-amber" : "text-muted"
            }`}
          >
            {next && next.scheduledAt ? countdown(next.scheduledAt, now) : "IDLE"}
          </span>
        }
      />

      <div className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-2.5 border-b border-line bg-black/30 px-4 py-1.5">
        <span className="label">Time</span>
        <span className="label">Clip</span>
        <span className="label">St</span>
      </div>

      <div className="label px-4 pb-1.5 pt-3">Upcoming</div>
      {upcoming.length === 0 ? (
        <div className="border-b border-line px-4 py-4 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.1em] text-muted">
          Nothing scheduled yet — pick a time in the console
        </div>
      ) : (
        upcoming.map((v) => (
          <Row
            key={v.id}
            v={v}
            selected={v.id === selectedId}
            flash={v.id === flashId}
            onSelect={onSelect}
          />
        ))
      )}

      <div className="label px-4 pb-1.5 pt-4">History</div>
      {history.length === 0 ? (
        <div className="border-b border-line px-4 py-4 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
          Nothing posted yet
        </div>
      ) : (
        history.map((v) => (
          <Row
            key={v.id}
            v={v}
            selected={v.id === selectedId}
            flash={v.id === flashId}
            onSelect={onSelect}
          />
        ))
      )}

      <div className="mt-auto border-t border-line px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="label">Auto-posting</span>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
              env?.schedulerError ? "text-fault" : "text-onair"
            }`}
          >
            {env?.schedulerError
              ? `Error · ${env.schedulerError.slice(0, 26)}`
              : env?.scheduler
                ? "Running · every 5s"
                : "Not running"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="label">Last tick</span>
          <span className="font-mono text-[10px] tabular-nums text-muted">{tickAt ?? "—"}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="label">Timezone</span>
          <span className="truncate pl-3 font-mono text-[10px] text-muted">{env?.tz ?? "—"}</span>
        </div>
        <div className="mt-3 border-t border-line pt-3 font-mono text-[10px] leading-relaxed text-muted">
            {env?.schedulerError ? (
              <span className="text-fault">SCHEDULER ERROR — {env.schedulerError}</span>
            ) : env?.instagram ? (
              <span className="text-onair">INSTAGRAM LINKED — REAL PUBLISHING</span>
            ) : (
              <span className="text-amber">NO INSTAGRAM KEY — POSTS ARE MARKED SIMULATED</span>
            )}
        </div>
      </div>
    </>
  );
}
