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
