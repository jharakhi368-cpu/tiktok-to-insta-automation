"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
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

      {/* ── submit a TikTok ─────────────────────────────────── */}
      <div className="border-b border-line px-4 py-4">
        <div className="label mb-2">Add a reel</div>

        <form onSubmit={submit} className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a TikTok link…"
            aria-label="TikTok link"
            className="min-w-0 flex-1 border border-line bg-white px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-muted focus:border-amber"
          />
          <button
            type="submit"
            disabled={!url.trim()}
            className="glass-cta flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold transition-all disabled:opacity-40"
          >
            <Send size={13} /> Add
          </button>
        </form>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 w-full border border-dashed border-line px-3 py-2.5 text-[13px] font-semibold text-muted transition-colors hover:border-amber hover:text-amber"
        >
          Or choose a video file
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

      <div className="stagger flex-1">
        {loading ? (
          <div className="px-4 py-6 font-mono text-[11px] text-muted">Loading…</div>
        ) : videos.length === 0 ? (
          <div className="px-4 py-6 font-mono text-[11px] leading-relaxed text-muted">
            NO VIDEOS YET.
            <br />
            PASTE A LINK OR UPLOAD A FILE ABOVE.
          </div>
        ) : (
          videos.map((v) => {
            const sel = v.id === selectedId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                className={`lift relative flex w-full gap-3 border-b border-line px-4 py-3 text-left ${
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
                  <span className="mt-1 block truncate text-[12px] font-semibold tracking-[0.01em] text-muted">
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
