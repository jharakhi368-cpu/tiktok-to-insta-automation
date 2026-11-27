/** Pure, client-safe helpers shared by the console UI. */

/** object-position X for each of the six filmstrip frames (%) */
export const COVER_X = [8, 24, 40, 56, 72, 88];

export type Tone = "amber" | "green" | "red" | "grey" | "blue";

export const STATUS: Record<string, { label: string; tone: Tone }> = {
  intake: { label: "NEW", tone: "blue" },
  ready: { label: "READY", tone: "grey" },
  scheduled: { label: "SCHEDULED", tone: "amber" },
  publishing: { label: "POSTING", tone: "amber" },
  published: { label: "POSTED", tone: "green" },
  failed: { label: "FAILED", tone: "red" },
};

export const TAGS = [
  "fyp",
  "foodie",
  "streetfood",
  "skatelife",
  "gymmotivation",
  "travel",
  "coffeelover",
  "tutorial",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** 24h local time, HH:MM */
export function hhmm(d: Date | string | null): string {
  if (!d) return "--:--";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "--:--";
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function hhmmss(d: Date): string {
  if (d.getFullYear() < 2000) return "--:--:--";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function dur(sec: number): string {
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

const DAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function dateLabel(d: Date | string | null): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return "";
  return `${DAY[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}`;
}

export function relative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** countdown for an upcoming schedule, T-00:41:12 */
export function countdown(target: string, now: Date): string {
  if (now.getFullYear() < 2000) return "--:--:--";
  const diff = new Date(target).getTime() - now.getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `T-${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** <input type="datetime-local"> value from an ISO string */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
