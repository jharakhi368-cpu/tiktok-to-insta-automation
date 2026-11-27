"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useConsole } from "./console-context";
import { Pill, SectionHead } from "./bits";
import { COVER_X, dateLabel, hhmm } from "@/lib/ui";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarView() {
  const { videos, now, setSelectedId, publish, busy } = useConsole();

  const [cursor, setCursor] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => dayKey(now));

  /** every published reel, bucketed by the day it went out */
  const byDay = useMemo(() => {
    const map = new Map<string, typeof videos>();
    for (const v of videos) {
      if (v.status !== "published" || !v.publishedAt) continue;
      const k = dayKey(new Date(v.publishedAt));
      const list = map.get(k) ?? [];
      list.push(v);
      map.set(k, list);
    }
    return map;
  }, [videos]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = dayKey(now);
  const selectedPosts = byDay.get(selected) ?? [];
  const selectedDate = new Date(`${selected}T00:00:00`);
  const totalPosted = videos.filter((v) => v.status === "published").length;

  const shift = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-6">
      <div className="border-b border-line pb-5">
        <div className="label">Schedule</div>
        <h1 className="mt-2 text-[40px] font-extrabold leading-[0.9] tracking-[-0.04em] sm:text-[54px]">
          Calendar
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {totalPosted === 0
            ? "No reels posted yet."
            : `${totalPosted} reel${totalPosted > 1 ? "s" : ""} published — tap a day to see them.`}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── month ───────────────────────────────── */}
        <div className="glass refract rounded-3xl border border-line p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[26px] font-bold leading-none tracking-[-0.03em] sm:text-[30px]">
                {MONTHS[cursor.getMonth()]}
              </div>
              <div className="mt-1 font-mono text-[13px] tabular-nums text-muted">
                {cursor.getFullYear()}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => shift(-1)}
                aria-label="Previous month"
                className="glass-thin flex h-10 w-10 items-center justify-center rounded-full text-ink transition-transform hover:scale-105 active:scale-95"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => shift(1)}
                aria-label="Next month"
                className="glass-thin flex h-10 w-10 items-center justify-center rounded-full text-ink transition-transform hover:scale-105 active:scale-95"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* weekday header */}
          <div className="mt-5 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d, i) => (
              <div
                key={i}
                className="pb-2 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
              >
                {d}
              </div>
            ))}
          </div>

          {/* days */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} className="aspect-square" />;
              const k = dayKey(d);
              const posts = byDay.get(k) ?? [];
              const isToday = k === todayKey;
              const isSel = k === selected;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelected(k)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-full transition-all duration-200 ${
                    isToday
                      ? "bg-amber text-white shadow-[0_6px_18px_-8px_rgba(0,113,227,.9)]"
                      : isSel
                        ? "bg-amber/15 text-amber"
                        : "text-ink hover:bg-white/70"
                  }`}
                >
                  <span className="text-[15px] font-medium tabular-nums leading-none sm:text-[16px]">
                    {d.getDate()}
                  </span>
                  {/* published marker */}
                  <span
                    className={`mt-1 h-1.5 w-1.5 rounded-full transition-all ${
                      posts.length === 0
                        ? "bg-transparent"
                        : isToday
                          ? "bg-white"
                          : "bg-amber"
                    }`}
                  />
                  {posts.length > 1 && !isToday ? (
                    <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber text-[9px] font-bold text-white">
                      {posts.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 font-mono text-[11px] text-muted">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" /> posted
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber" /> today
            </span>
            <span className="flex items-center gap-2">
              <CalendarDays size={13} /> tap a day to list its reels
            </span>
          </div>
        </div>

        {/* ── selected day ───────────────────────── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHead
            num="06"
            title={dateLabel(selectedDate) || "Selected day"}
            right={
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {String(selectedPosts.length).padStart(2, "0")}
              </span>
            }
          />

          {selectedPosts.length === 0 ? (
            <div className="glass-thin mt-4 rounded-2xl border border-line px-4 py-8 text-center">
              <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                Nothing posted
              </div>
              <p className="mx-auto mt-2 max-w-[26ch] text-[13px] leading-relaxed text-muted">
                {dateLabel(selectedDate)} has no reels. Days with a blue dot have posts.
              </p>
            </div>
          ) : (
            <div className="stagger mt-4 flex flex-col gap-3">
              {selectedPosts.map((v) => (
                <article
                  key={v.id}
                  className="glass lift group flex gap-3 border border-line p-3"
                >
                  <div className="relative aspect-[9/16] w-[64px] shrink-0 overflow-hidden rounded-xl bg-black">
                    <img
                      src={v.coverImage ?? v.thumb}
                      alt=""
                      className="h-full w-full object-cover"
                      style={{
                        objectPosition: v.coverImage
                          ? "50% 50%"
                          : `${COVER_X[v.coverFrame] ?? 40}% 50%`,
                      }}
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href="/posted"
                        onClick={() => setSelectedId(v.id)}
                        className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-tight transition-colors hover:text-amber"
                      >
                        {v.title}
                      </Link>
                      <Pill status={v.status} />
                    </div>

                    <p className="mt-1 line-clamp-2 flex-1 text-[12px] leading-snug text-muted">
                      {v.caption || "— no caption —"}
                    </p>

                    <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-mono text-[10px] tabular-nums text-muted">
                      <span>{hhmm(v.publishedAt)}</span>
                      <span className="truncate text-amber/80">{v.igMediaId ?? ""}</span>
                    </div>
                  </div>
                </article>
              ))}

              {selectedPosts.some((v) => v.status === "failed") ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const f = selectedPosts.find((v) => v.status === "failed");
                    if (f) void publish(f.id);
                  }}
                  className="glass-thin rounded-xl border border-line px-3 py-2.5 font-mono text-[11px] text-fault transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
                >
                  Retry failed
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
