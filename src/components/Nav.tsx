"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsole } from "./console-context";

const ITEMS = [
  { href: "/", label: "Console", sub: "create" },
  { href: "/queue", label: "Queue", sub: "scheduled" },
  { href: "/posted", label: "Posted", sub: "history" },
  { href: "/ig", label: "Instagram", sub: "connected" },
];

export default function Nav() {
  const { videos, env, tickAt } = useConsole();
  const path = usePathname();

  const counts: Record<string, number | null> = {
    "/queue": videos.filter((v) => v.status === "scheduled").length,
    "/posted": videos.filter((v) => v.status === "published").length,
    "/ig": env?.instagram ? 1 : 0,
  };

  return (
    <nav className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-panel/80 px-4 backdrop-blur-xl">
      <div className="flex flex-wrap">
        {ITEMS.map((it, i) => {
          const active = path === it.href;
          const count = counts[it.href];
          return (
            <Link
              key={it.href}
              href={it.href}
              style={{ animationDelay: `${i * 45}ms` }}
              className={`group relative animate-[rise_.45s_cubic-bezier(.22,.61,.36,1)_both] px-5 py-4 transition-colors duration-200 ${
                active ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
                  {it.label}
                </span>
                {count ? (
                  <span
                    className={`font-mono text-[9.5px] tabular-nums transition-colors ${
                      active ? "text-amber" : "text-muted/60 group-hover:text-muted"
                    }`}
                  >
                    {String(count).padStart(2, "0")}
                  </span>
                ) : null}
              </span>

              {/* animated underline: grows from the centre when active */}
              <span
                className={`absolute inset-x-0 -bottom-px h-[2px] origin-center transition-transform duration-300 ease-out ${
                  active ? "scale-x-100 bg-amber" : "scale-x-0 bg-amber/70 group-hover:scale-x-50"
                }`}
              />
              {/* soft glow under the active tab */}
              {active ? (
                <span className="pointer-events-none absolute inset-x-3 -bottom-px h-4 bg-amber/15 blur-md" />
              ) : null}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-5 py-2">
        <span className="flex items-center gap-2">
          <span
            className={`h-[6px] w-[6px] rounded-full ${
              env?.scheduler
                ? "bg-onair shadow-[0_0_7px_rgba(123,216,143,.85)] animate-[ledblink_2.4s_ease-in-out_infinite]"
                : "bg-fault/70"
            }`}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {env?.scheduler ? "Live" : "Paused"}
          </span>
        </span>
        <span className="hidden font-mono text-[10px] tabular-nums text-muted/70 md:inline">
          {tickAt ?? "—"}
        </span>
      </div>
    </nav>
  );
}
