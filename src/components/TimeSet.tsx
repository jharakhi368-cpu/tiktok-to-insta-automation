"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Props = {
  value: string | null;
  onChange: (iso: string) => void;
  now: Date;
};

function Step({
  label,
  value,
  onDown,
  onUp,
}: {
  label: string;
  value: number;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <div className="border border-line bg-sunken">
      <div className="label border-b border-line py-1 text-center">{label}</div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onDown}
          aria-label={`decrease ${label}`}
          className="px-2.5 py-1.5 text-[15px] leading-none text-muted transition-colors hover:text-amber"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="font-mono text-[22px] leading-none tabular-nums text-ink">{pad(value)}</span>
        <button
          type="button"
          onClick={onUp}
          aria-label={`increase ${label}`}
          className="px-2.5 py-1.5 text-[15px] leading-none text-muted transition-colors hover:text-amber"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function TimeSet({ value, onChange, now }: Props) {
  const [local, setLocal] = useState<Date>(() =>
    value ? new Date(value) : new Date(now.getTime() + 3600_000),
  );

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) setLocal(d);
    } else {
      // no air time yet — propose one so the display and "Queue" always agree
      const d = new Date(Date.now() + 3600_000);
      d.setSeconds(0, 0);
      setLocal(d);
      onChange(d.toISOString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (d: Date) => {
    setLocal(d);
    onChange(d.toISOString());
  };

  const setDay = (day: Date) => {
    const d = new Date(local);
    d.setDate(day.getDate());
    d.setMonth(day.getMonth());
    d.setFullYear(day.getFullYear());
    emit(d);
  };

  const bumpHour = (delta: number) => {
    const d = new Date(local);
    d.setHours((d.getHours() + delta + 24) % 24);
    emit(d);
  };

  const bumpMin = (delta: number) => {
    const d = new Date(local);
    d.setMinutes((d.getMinutes() + delta + 60) % 60, 0, 0);
    emit(d);
  };

  const setMinutes = (m: number) => {
    const d = new Date(local);
    d.setMinutes(m, 0, 0);
    emit(d);
  };

  const preset = (kind: string) => {
    const d = new Date();
    if (kind === "now") d.setSeconds(0, 0);
    if (kind === "2h") d.setTime(d.getTime() + 2 * 3600_000);
    if (kind === "tonight") {
      d.setHours(19, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    }
    if (kind === "tmrw") {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    }
    emit(d);
  };

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const diff = local.getTime() - now.getTime();
  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const cd = `T-${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}`;

  const dateInput = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;

  return (
    <div className="glass border border-line rounded-2xl p-3">
      <div className="flex items-center justify-between">
        <span className="label">Air time · custom set</span>
        <span className="font-mono text-[11px] tabular-nums text-amber">{cd}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[30px] font-extrabold leading-none tracking-[-0.035em] text-ink">
          {pad(local.getHours())}:{pad(local.getMinutes())}
        </span>
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-muted">
          {DAY[local.getDay()]} {pad(local.getDate())} {MON[local.getMonth()]} {local.getFullYear()}
        </span>
      </div>

      <div className="mt-3 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const on = sameDay(d, local);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => setDay(d)}
              className={`shrink-0 border px-2.5 py-1.5 text-[12px] font-semibold tracking-[0.01em] transition-colors ${
                on
                  ? "border-amber bg-amber/15 text-amber"
                  : "border-line text-muted hover:border-amber/60 hover:text-ink"
              }`}
            >
              {d.getDate() === now.getDate() && d.getMonth() === now.getMonth()
                ? "Today"
                : d.getDate() === now.getDate() + 1 && d.getMonth() === now.getMonth()
                  ? "Tmrw"
                  : `${DAY[d.getDay()]} ${pad(d.getDate())}`}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 grid grid-cols-[1fr_14px_1fr] items-center gap-2">
        <Step
          label="Hour"
          value={local.getHours()}
          onDown={() => bumpHour(-1)}
          onUp={() => bumpHour(1)}
        />
        <span className="text-center font-mono text-[18px] text-muted">:</span>
        <Step
          label="Minute"
          value={local.getMinutes()}
          onDown={() => bumpMin(-5)}
          onUp={() => bumpMin(5)}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {[0, 15, 30, 45].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMinutes(m)}
            className={`border px-2 py-1 font-mono text-[10px] tabular-nums transition-colors ${
              local.getMinutes() === m
                ? "border-amber text-amber"
                : "border-line text-muted hover:border-amber/60 hover:text-ink"
            }`}
          >
            :{pad(m)}
          </button>
        ))}
        <input
          type="date"
          value={dateInput}
          aria-label="Air date"
          onChange={(e) => {
            const [y, m, d] = e.target.value.split("-").map(Number);
            if (!y || !m || !d) return;
            const next = new Date(local);
            next.setFullYear(y, m - 1, d);
            emit(next);
          }}
          className="ml-auto w-[140px] border border-line bg-sunken px-2 py-1 font-mono text-[11px] tabular-nums text-ink outline-none transition-colors focus:border-amber [color-scheme:light]"
        />
      </div>

      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {[
          { k: "now", l: "Now" },
          { k: "2h", l: "+2h" },
          { k: "tonight", l: "19:00" },
          { k: "tmrw", l: "09:00" },
        ].map((p) => (
          <button
            key={p.k}
            type="button"
            onClick={() => preset(p.k)}
            className="border border-line bg-sunken px-2 py-1.5 text-[12px] font-semibold tracking-[0.01em] text-muted transition-colors hover:border-amber hover:text-amber"
          >
            {p.l}
          </button>
        ))}
      </div>
    </div>
  );
}
