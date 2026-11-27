import type { ReactNode } from "react";
import { STATUS, type Tone } from "@/lib/ui";

const TONE: Record<Tone, string> = {
  amber: "border-amber/45 bg-amber/10 text-amber",
  green: "border-onair/45 bg-onair/10 text-onair",
  red: "border-fault/45 bg-fault/10 text-fault",
  grey: "border-line bg-white/[0.03] text-muted",
  blue: "border-tg/45 bg-tg/10 text-tg",
};

export function Pill({ status }: { status: string }) {
  const meta = STATUS[status] ?? { label: status.toUpperCase(), tone: "grey" as Tone };
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.01em] ${TONE[meta.tone]}`}
    >
      <span
        className={`h-1 w-1 rounded-full ${
          meta.tone === "amber"
            ? "bg-amber animate-[ledblink_2s_ease-in-out_infinite]"
            : meta.tone === "green"
              ? "bg-onair"
              : meta.tone === "red"
                ? "bg-fault"
                : meta.tone === "blue"
                  ? "bg-tg"
                  : "bg-muted"
        }`}
      />
      {meta.label}
    </span>
  );
}

export function SectionHead({
  num,
  title,
  right,
}: {
  num: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="rise flex items-center gap-3 border-b border-line px-4 py-3">
      <span className="font-mono text-[11px] font-medium text-amber">{num}</span>
      <span className="label flex-1">{title}</span>
      {right}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-3 border-b border-line py-2.5 text-left last:border-b-0"
    >
      <span className="min-w-0">
        <span
          className={`block text-[13px] font-semibold tracking-[-0.01em] transition-colors ${
            checked ? "text-ink" : "text-muted"
          } group-hover:text-ink`}
        >
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-muted/80">{hint}</span>
        ) : null}
      </span>
      <span
        className={`relative h-[18px] w-[34px] shrink-0 border transition-colors ${
          checked ? "border-amber bg-amber/25" : "border-line bg-sunken"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[12px] w-[12px] transition-all duration-150 ${
            checked ? "left-[18px] bg-amber" : "left-[2px] bg-muted"
          }`}
        />
      </span>
    </button>
  );
}
