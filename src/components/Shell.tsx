"use client";

import type { ReactNode } from "react";
import { ConsoleProvider, useConsole } from "./console-context";
import StatusBar from "./StatusBar";
import Nav from "./Nav";

function Frame({ children, variant }: { children: ReactNode; variant: "console" | "page" }) {
  const { toast, now, env, videos, fault } = useConsole();

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <StatusBar now={now} env={env} videos={videos} fault={fault} />
      <Nav />
      <main
        className={
          variant === "console"
            ? "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_360px] lg:overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto"
        }
      >
        {children}
      </main>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 max-w-[340px] animate-[toastin_.18s_ease-out] border border-line border-l-2 border-l-amber bg-raise px-4 py-3 font-mono text-[11px] leading-relaxed text-ink shadow-[0_18px_40px_rgba(0,0,0,.55)]"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export default function Shell({
  children,
  variant = "page",
}: {
  children: ReactNode;
  variant?: "console" | "page";
}) {
  return (
    <ConsoleProvider>
      <Frame variant={variant}>{children}</Frame>
    </ConsoleProvider>
  );
}
