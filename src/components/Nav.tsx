"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsole } from "./console-context";

const ITEMS = [
  { href: "/", label: "Console", sub: "intake + edit" },
  { href: "/queue", label: "Queue", sub: "scheduled" },
  { href: "/posted", label: "Posted", sub: "history" },
  { href: "/bot", label: "Telegram", sub: "link bot" },
  { href: "/ig", label: "Instagram", sub: "link account" },
  { href: "/setup", label: "Go live", sub: "deploy free" },
];

export default function Nav() {
  const { videos, env, tickAt } = useConsole();
  const path = usePathname();

  const counts: Record<string, number | null> = {
    "/queue": videos.filter((v) => v.status === "scheduled").length,
    "/posted": videos.filter((v) => v.status === "published").length,
    "/bot": env?.bot ? 1 : 0,
    "/ig": env?.instagram ? 1 : 0,
  };

  return (
    <nav className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-panel/85 px-4 py-0 backdrop-blur">
      <div className="flex flex-wrap">
        {ITEMS.map((it) => {
          const active = path === it.href;
          const count = counts[it.href];
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`relative px-4 py-3.5 transition-colors ${
                active ? "text-amber" : "text-muted hover:text-ink"
              }`}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.16em]">{it.label}</span>
              {count ? (
                <span
                  className={`ml-1.5 font-mono text-[9.5px] tabular-nums ${
                    active ? "text-amber" : "text-muted/70"
                  }`}
                >
                  {String(count).padStart(2, "0")}
                </span>
              ) : null}
              <span
                className={`absolute inset-x-0 -bottom-px h-[2px] transition-colors ${
                  active ? "bg-amber" : "bg-transparent"
                }`}
              />
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-4 py-2">
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:inline">
          {env?.botHandle ?? "@reelay_bot"}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={`h-[7px] w-[7px] rounded-full ${
              env?.polling
                ? "bg-onair shadow-[0_0_6px_rgba(123,216,143,.8)] animate-[ledblink_2s_ease-in-out_infinite]"
                : "bg-fault/70"
            }`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {env?.polling ? "Bot live" : "Bot off"}
          </span>
        </span>
        <span className="hidden font-mono text-[10px] tabular-nums text-muted/80 md:inline">
          tick {tickAt ?? "—"}
        </span>
      </div>
    </nav>
  );
}
