"use client";

import { useRef, useState } from "react";
import { Link2, Upload } from "lucide-react";
import { useConsole } from "./console-context";
import { Pill, SectionHead } from "./bits";
import { COVER_X, dur, relative } from "@/lib/ui";

/**
 * The TikTok submission box is the entry point of the whole product, so it sits
 * at the very top of the console as the hero — never buried below the list.
 */

/** Read a frame + duration out of a chosen file, in the browser. */
function probeVideo(file: File): Promise<{ thumb?: string; duration?: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: { thumb?: string; duration?: number }) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };

    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    el.src = url;

    el.onloadeddata = () => {
      const duration = Number.isFinite(el.duration) ? Math.round(el.duration) : undefined;
      try {
        el.currentTime = Math.min(1, (el.duration || 1) * 0.2);
      } catch {
        done({ duration });
      }
      pending = duration;
    };

    let pending: number | undefined;
    el.onseeked = () => {
      try {
        const width = 320;
        const height = Math.round((el.videoHeight / el.videoWidth) * width) || 568;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(el, 0, 0, width, height);
        done({ thumb: canvas.toDataURL("image/jpeg", 0.82), duration: pending });
      } catch {
        done({ duration: pending });
      }
    };
    el.onerror = () => done({});
    setTimeout(() => done({}), 8000);
  });
}

export default function IntakeRail({
  videos,
  selectedId,
  onSelect,
  onIntake,
  loading,
}: {
  videos: {
    id: string;
    title: string;
    thumb: string;
    coverImage: string | null;
    coverFrame: number;
    durationSec: number;
    status: string;
    createdAt: string;
  }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIntake: (p: {
    url?: string;
    fileName?: string;
    file?: File;
    thumb?: string;
    duration?: number;
  }) => void;
  loading: boolean;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value || busy) return;
    setBusy(true);
    onIntake({ url: value });
    setUrl("");
    // the ingest call is optimistic; clear busy as soon as the row lands
    setTimeout(() => setBusy(false), 1200);
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    // grab a poster frame and the duration client-side so the clip doesn't
    // land in the list with a stock thumbnail
    probeVideo(f)
      .then(({ thumb, duration }) => {
        onIntake({ file: f, thumb, duration });
      })
      .catch(() => onIntake({ file: f }));
  };

  return (
    <>
      {/* ── the submission box — hero, first thing on screen ────── */}
      <div className="glass refract border-b border-line px-4 py-4 sm:px-5 sm:py-5">
        <div className="label mb-2.5">Add a TikTok</div>

        <form onSubmit={submit}>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Link2
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste a TikTok link…"
                aria-label="TikTok link"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border border-line bg-sunken py-3 pl-10 pr-3 text-[14px] text-ink outline-none transition-all placeholder:text-muted/70 focus:border-amber focus:bg-panel focus:ring-4 focus:ring-amber/12"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="glass-cta shrink-0 rounded-xl px-5 py-3 text-[14px] font-semibold tracking-[-0.01em] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </form>

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-amber"
          >
            <Upload size={13} /> Upload a video file instead
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={pick}
          />
          <span className="text-[11.5px] text-muted/70">
            {videos.length} {videos.length === 1 ? "video" : "videos"}
          </span>
        </div>
      </div>

      {/* ── the list ─────────────────────────────────────────────── */}
      <SectionHead
        num="01"
        title="Your videos"
        right={
          <span className="font-mono text-[10px] tabular-nums text-muted">
            {String(videos.length).padStart(2, "0")}
          </span>
        }
      />

      <div className="stagger flex-1">
        {loading ? (
          <div className="px-4 py-6 text-[13px] text-muted">Loading…</div>
        ) : videos.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              No videos yet
            </div>
            <p className="mx-auto mt-2 max-w-[26ch] text-[13px] leading-relaxed text-muted">
              Paste a TikTok link above — REELAY downloads it, then walks you
              through the cover, caption and air time.
            </p>
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
                  className={`h-[58px] w-[40px] shrink-0 rounded-lg border border-line object-cover ${
                    sel ? "" : "opacity-80"
                  }`}
                  style={{
                    objectPosition: v.coverImage
                      ? "50% 50%"
                      : `${COVER_X[v.coverFrame] ?? 40}% 50%`,
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight">
                    {v.title}
                  </span>
                  <span className="mt-1 block truncate text-[12px] font-semibold tracking-[0.01em] text-muted">
                    {dur(v.durationSec)} · {relative(v.createdAt)}
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
