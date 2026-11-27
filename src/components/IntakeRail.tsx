"use client";

import { useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import type { Env, VideoDTO } from "@/lib/types";
import { COVER_X, dur, relative } from "@/lib/ui";
import { Pill, SectionHead } from "./bits";

export default function IntakeRail({
  videos,
  selectedId,
  onSelect,
  onIntake,
  env,
  loading,
}: {
  videos: VideoDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIntake: (p: { url?: string; fileName?: string }) => void;
  env: Env | null;
  loading: boolean;
}) {
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onIntake({ url: url.trim() });
    setUrl("");
  };

  return (
    <>
      <SectionHead
        num="01"
        title="Your videos"
        right={
          <span className="font-mono text-[10px] tabular-nums text-muted">
            {videos.length} VIDEOS
          </span>
        }
      />

      {env && !env.bot ? (
        <a
          href="/bot"
          className="block border-b border-line border-l-2 border-l-fault bg-fault/10 px-4 py-3 transition-colors hover:bg-fault/20"
        >
          <span className="block font-mono text-[11px] leading-relaxed text-fault">
            Telegram bot not connected — videos you send there won't arrive here yet.
          </span>
          <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.12em] text-amber">
            Connect your bot in 30 seconds →
          </span>
        </a>
      ) : null}

      {env?.botError ? (
        <div className="border-b border-line border-l-2 border-l-amber bg-amber/10 px-4 py-2.5 font-mono text-[11px] leading-relaxed text-amber">
          Bot error: {env.botError}
        </div>
      ) : null}

      <div className="border-b border-line px-4 py-3.5">
        <form onSubmit={submit} className="flex gap-1.5">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="paste tiktok link…"
            aria-label="TikTok link"
            className="min-w-0 flex-1 border border-line bg-black/40 px-2.5 py-2 font-mono text-[11px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-amber"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 border border-line bg-raise px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink transition-colors hover:border-amber hover:text-amber active:translate-y-px"
          >
            <Send size={12} /> Drop
          </button>
        </form>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 w-full border border-dashed border-line px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-amber/70 hover:text-amber"
        >
          or drop a video file from disk
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onIntake({ fileName: f.name });
            e.target.value = "";
          }}
        />
      </div>

      <div className="border-b border-line bg-panel/70 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 label">
            <Bot size={12} className="text-tg" /> Telegram bot
          </span>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
              env?.bot ? "text-onair" : "text-fault"
            }`}
          >
            {env?.bot ? "LINKED" : "NO TOKEN"}
          </span>
        </div>
        <div className="mt-2 font-mono text-[13px] text-ink">{env?.botHandle ?? "@reelay_bot"}</div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Send any TikTok video to the bot — it lands here with its own thumbnail and a hosted
          asset. Set <span className="font-mono text-amber">TELEGRAM_BOT_TOKEN</span> to go live.
        </p>
      </div>

      <div className="flex-1">
        {loading ? (
          <div className="px-4 py-6 font-mono text-[11px] text-muted">LOADING YOUR VIDEOS…</div>
        ) : videos.length === 0 ? (
          <div className="px-4 py-6 font-mono text-[11px] leading-relaxed text-muted">
            NO VIDEOS YET.
            <br />
            SEND ONE TO THE BOT OR PASTE A LINK ABOVE.
          </div>
        ) : (
          videos.map((v) => {
            const sel = v.id === selectedId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                className={`relative flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors ${
                  sel ? "bg-raise" : "hover:bg-panel"
                }`}
              >
                <span
                  className={`absolute left-0 top-0 h-full w-[3px] transition-colors ${
                    sel ? "bg-amber" : "bg-transparent"
                  }`}
                />
                <img
                  src={v.coverImage ?? v.thumb}
                  alt=""
                  className={`h-[58px] w-[40px] shrink-0 border border-line object-cover ${
                    sel ? "" : "opacity-80"
                  }`}
                  style={{
                    objectPosition: v.coverImage ? "50% 50%" : `${COVER_X[v.coverFrame] ?? 40}% 50%`,
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight">
                    {v.title}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    {dur(v.durationSec)} · {v.origin} · {relative(v.createdAt)}
                  </span>
                  <span className="mt-1.5 block">
                    <Pill status={v.status} />
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
