"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConsole } from "./console-context";

const ITEMS = [
  { href: "/", label: "Console", sub: "create" },
  { href: "/queue", label: "Queue", sub: "scheduled" },
  { href: "/posted", label: "Posted", sub: "history" },
  { href: "/calendar", label: "Calendar", sub: "by day" },
  { href: "/ig", label: "Instagram", sub: "connected" },
];

function SignOut() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEmail(d?.user?.email ?? null))
      .catch(() => undefined);
  }, []);

  if (!email) return null;

  return (
    <span className="flex items-center gap-3">
      <span className="hidden max-w-[190px] truncate font-mono text-[11px] text-muted sm:inline">
        {email}
      </span>
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          // full navigation: the session cookie is gone, so a hard load
          // cannot be served from a stale authenticated router cache
          window.location.assign("/login");
        }}
        className="rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10px] text-muted transition-colors hover:border-fault hover:text-fault"
      >
        Sign out
      </button>
    </span>
  );
}

export default function Nav() {
  const { videos, env, tickAt } = useConsole();
  const path = usePathname();

  const counts: Record<string, number | null> = {
    "/queue": videos.filter((v) => v.status === "scheduled").length,
    "/posted": videos.filter((v) => v.status === "published").length,
    "/ig": env?.instagram ? 1 : 0,
  };

  return (
    <nav className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 glass border-b border-line px-5">
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
                <span className="text-[13px] font-semibold tracking-[-0.01em]">
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

      <div className="flex items-center gap-4 py-2">
        <SignOut />
        <span className="flex items-center gap-2">
          <span
            className={`h-[6px] w-[6px] rounded-full ${
              env?.scheduler
                ? "bg-onair shadow-[0_0_7px_rgba(123,216,143,.85)] animate-[ledblink_2.4s_ease-in-out_infinite]"
                : "bg-fault/70"
            }`}
          />
          <span className="text-[12px] font-semibold tracking-[0.01em] text-muted">
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
