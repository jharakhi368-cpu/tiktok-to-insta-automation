"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useConsole } from "./console-context";
import { Pill, SectionHead } from "./bits";
import { COVER_X, dateLabel, dur, hhmm } from "@/lib/ui";

export default function PostedView() {
  const { videos, publish, busy, setSelectedId, clearHistory } = useConsole();

  const posted = videos
    .filter((v) => v.status === "published")
    .sort((a, b) => +new Date(b.publishedAt ?? b.createdAt) - +new Date(a.publishedAt ?? a.createdAt));
  const failed = videos.filter((v) => v.status === "failed");

  const simulated = posted.filter((v) => v.igMediaId?.startsWith("SIM-")).length;
  const real = posted.length - simulated;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-6">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-5">
        <div>
          <div className="label">04 · History</div>
          <h1 className="mt-2 text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[54px]">
            Posted
          </h1>
        </div>
        <div className="flex gap-7">
          <div>
            <div className="font-mono text-[26px] leading-none tabular-nums text-amber">
              {String(posted.length).padStart(2, "0")}
            </div>
            <div className="label mt-1.5">Total</div>
          </div>
          <div>
            <div className="font-mono text-[26px] leading-none tabular-nums text-onair">
              {String(real).padStart(2, "0")}
            </div>
            <div className="label mt-1.5">Live</div>
          </div>
          <div>
            <div className="font-mono text-[26px] leading-none tabular-nums text-muted">
              {String(simulated).padStart(2, "0")}
            </div>
            <div className="label mt-1.5">Simulated</div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Clear the history? This removes every posted and failed entry from this list. Scheduled and inbox clips stay.",
                  )
                ) {
                  void clearHistory("history");
                }
              }}
              disabled={!posted.length && !failed.length}
              className="flex items-center gap-2 border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-fault hover:text-fault disabled:opacity-40"
            >
              <Trash2 size={12} /> Clear history
            </button>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted/70">
              keeps scheduled + inbox
            </span>
          </div>
        </div>
      </div>

      {failed.length > 0 ? (
        <div className="mt-6">
          <SectionHead
            num="!"
            title="Failed to post"
            right={
              <span className="font-mono text-[10px] tabular-nums text-fault">
                {String(failed.length).padStart(2, "0")}
              </span>
            }
          />
          {failed.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-l-2 border-b-line border-l-fault bg-fault/5 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold">{v.title}</div>
                <div className="mt-1 truncate font-mono text-[11px] text-fault">
                  {v.error ?? "unknown fault"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => publish(v.id)}
                disabled={busy}
                className="flex items-center gap-1.5 border border-fault/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fault transition-colors hover:bg-fault hover:text-[#101216] disabled:opacity-50"
              >
                <RotateCcw size={12} /> Retry
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-7">
        <SectionHead
          num="05"
          title="Feed history"
          right={
            <span className="font-mono text-[10px] tabular-nums text-muted">
              {String(posted.length).padStart(2, "0")} POSTS
            </span>
          }
        />

        {posted.length === 0 ? (
          <div className="border border-line bg-panel/50 px-6 py-16 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Nothing posted yet
            </div>
            <p className="mx-auto mt-3 max-w-[380px] text-[13.5px] leading-relaxed text-muted">
              Arm a clip in the queue and the scheduler will push it to Instagram at the minute you
              set — you'll see it land here with its cover and caption.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {posted.map((v) => (
              <article
                key={v.id}
                className="group flex gap-3 border border-line bg-panel/60 p-3 transition-all hover:border-amber/50 hover:bg-raise"
              >
                <div className="relative aspect-[9/16] w-[74px] shrink-0 overflow-hidden border border-line bg-black">
                  <img
                    src={v.coverImage ?? v.thumb}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                    style={{
                      objectPosition: v.coverImage
                        ? "50% 50%"
                        : `${COVER_X[v.coverFrame] ?? 40}% 50%`,
                    }}
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold leading-tight transition-colors hover:text-amber"
                    >
                      {v.title}
                    </button>
                    <Pill status={v.status} />
                  </div>

                  <p className="mt-1.5 line-clamp-3 flex-1 text-[12px] leading-relaxed text-muted">
                    {v.caption || "— no caption —"}
                  </p>

                  <div className="mt-2 border-t border-line pt-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                    {dateLabel(v.publishedAt)} · {hhmm(v.publishedAt)} · {dur(v.durationSec)}
                  </div>
                  <div className="mt-1 truncate font-mono text-[9.5px] tracking-[0.08em] text-amber/80">
                    {v.igMediaId ?? "—"}
                    {v.error ? ` · ${v.error}` : ""}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
