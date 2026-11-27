"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ImagePlus,
  Play,
  Trash2,
  Zap,
} from "lucide-react";
import type { VideoDTO } from "@/lib/types";
import { COVER_X, TAGS, countdown, dateLabel, hhmm } from "@/lib/ui";
import { SectionHead, Toggle } from "./bits";
import TimeSet from "./TimeSet";

type Props = {
  video: VideoDTO | null;
  now: Date;
  busy: boolean;
  onChange: (id: string, patch: Record<string, unknown>) => void;
  onQueue: (id: string, scheduledAt: string | null) => void;
  onPublish: (id: string) => void;
  onDelete: (id: string) => void;
  onCover: (id: string, file: File | null) => void;
  onReset: () => void;
};

const STEPS = ["Cover", "Caption", "Schedule", "Posted"];

export default function EditBay({
  video,
  now,
  busy,
  onChange,
  onQueue,
  onPublish,
  onDelete,
  onCover,
  onReset,
}: Props) {
  const [step, setStep] = useState(1);
  const [caption, setCaption] = useState("");
  const [frame, setFrame] = useState(0);
  const [first, setFirst] = useState(true);
  const [story, setStory] = useState(false);
  const [auto, setAuto] = useState(true);
  const [sched, setSched] = useState<string | null>(null);
  const [pickCustom, setPickCustom] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  /** a custom cover is what you see first — the video is one tap away */
  const [playing, setPlaying] = useState(false);

  const id = video?.id ?? null;
  const custom = Boolean(video?.coverImage);

  useEffect(() => {
    if (!video) return;
    setCaption(video.caption);
    setFrame(video.coverFrame);
    setFirst(video.firstComment);
    setStory(video.shareToStory);
    setAuto(video.publishMode === "auto");
    setSched(video.scheduledAt);
    setPickCustom(false);
    setPlaying(false);
    setStep(video.status === "published" ? 4 : video.scheduledAt ? 3 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // jump to the confirmation step the moment it goes out
  useEffect(() => {
    if (video?.status === "published" || video?.status === "failed") setStep(4);
  }, [video?.status]);

  // debounced autosave of the caption
  const pending = useRef<{ id: string; caption: string } | null>(null);
  useEffect(() => {
    if (!id || !video) return;
    if (caption === video.caption) {
      pending.current = null;
      return;
    }
    pending.current = { id, caption };
    const t = setTimeout(() => {
      pending.current = null;
      onChange(id, { caption });
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption, id, video?.caption]);

  useEffect(() => {
    const prev = id;
    return () => {
      if (prev && pending.current?.id === prev) {
        const p = pending.current;
        pending.current = null;
        onChange(p.id, { caption: p.caption });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // follow the server's air time
  useEffect(() => {
    if (video) setSched(video.scheduledAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.scheduledAt]);

  if (!video) {
    return (
      <>
        <SectionHead num="02" title="Make your reel" />
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            No video selected
          </div>
          <p className="max-w-[300px] text-[13.5px] leading-relaxed text-muted">
            Send a TikTok to the bot, or paste a link on the left. Then pick its cover, write the
            caption and choose when it goes out.
          </p>
        </div>
      </>
    );
  }

  const pickCover = (i: number) => {
    const clamped = Math.max(0, Math.min(5, i));
    if (clamped === frame && !custom) return;
    setFrame(clamped);
    onChange(id!, { coverFrame: clamped, coverImage: null });
  };

  const onStripPointer = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const el = stripRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const idx = Math.floor(((e.clientX - r.left) / r.width) * 6);
    if (commit || dragging) pickCover(idx);
  };

  // save the caption right now instead of waiting for the debounce
  const flushCaption = () => {
    if (video && caption !== video.caption) onChange(id!, { caption });
  };

  const toggleTag = (t: string) => {
    const token = `#${t}`;
    const has = caption.toLowerCase().includes(token.toLowerCase());
    setCaption(
      has
        ? caption.replace(new RegExp(`\\s*${token}`, "ig"), "").replace(/\s+$/, "")
        : `${caption.replace(/\s+$/, "")} ${token}`.trimStart(),
    );
  };

  const armIn = (hours: number) => {
    flushCaption();
    const d = new Date(Date.now() + hours * 3600_000);
    d.setSeconds(0, 0);
    setSched(d.toISOString());
    onQueue(id!, d.toISOString());
    setStep(4);
  };

  const postNow = () => {
    flushCaption();
    onPublish(id!);
    setStep(4);
  };

  const len = caption.length;
  const countTone = len > 2200 ? "text-fault" : len > 2000 ? "text-amber" : "text-muted";
  const coverSrc = video.coverImage ?? video.thumb;
  // a clip REELAY downloaded itself is playable right here
  const hasVideo = Boolean(video.assetUrl && video.assetUrl.startsWith("/"));
  const coverName = video.coverImage
    ? "Your uploaded cover"
    : frame === 0
      ? "Original cover"
      : `Frame ${frame + 1} of 6`;

  return (
    <>
      <SectionHead
        num="02"
        title="Make your reel"
        right={
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-amber">
            {video.origin === "manual" ? "ADDED BY YOU" : "FROM TELEGRAM"}
          </span>
        }
      />

      {/* stepper */}
      <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStep(n)}
              className={`flex items-center justify-center gap-2 px-2 py-2.5 transition-colors ${
                active ? "bg-raise" : "hover:bg-panel"
              }`}
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full font-mono text-[10px] ${
                  active
                    ? "bg-amber text-[#101216]"
                    : done
                      ? "bg-onair/20 text-onair"
                      : "bg-black/40 text-muted"
                }`}
              >
                {done ? <Check size={11} /> : n}
              </span>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  active ? "text-ink" : done ? "text-onair" : "text-muted"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 p-4 xl:grid-cols-[268px_minmax(0,1fr)]">
        {/* ── the reel ───────────────────────────── */}
        <div className="mx-auto w-full max-w-[280px] xl:mx-0 xl:max-w-none">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Your reel</span>
            <span
              className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${
                custom ? "text-ig" : "text-muted"
              }`}
            >
              {coverName}
            </span>
          </div>

          <div className="relative aspect-[9/16] w-full overflow-hidden border border-line bg-black">
            {hasVideo && (!custom || playing) ? (
              <video
                key={video.assetUrl}
                src={video.assetUrl!}
                controls
                muted
                playsInline
                preload="metadata"
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              <>
                <img
                  src={coverSrc}
                  alt={video.title}
                  className="h-full w-full object-cover transition-[object-position] duration-150 ease-out"
                  style={{ objectPosition: custom ? "50% 50%" : `${COVER_X[frame] ?? 40}% 50%` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/45" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="font-mono text-[10px] tracking-[0.1em] text-amber">
                    @yourhandle
                  </div>
                  <div className="mt-1 line-clamp-3 text-[13px] font-medium leading-snug text-white drop-shadow">
                    {caption.split("\n")[0]?.trim() || "your caption shows up here"}
                  </div>
                </div>
              </>
            )}

            {hasVideo && custom && !playing ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 transition-colors hover:bg-black/50"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-amber text-amber">
                  <Play size={20} />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink">
                  Play video
                </span>
              </button>
            ) : null}

            {hasVideo && custom && playing ? (
              <button
                type="button"
                onClick={() => setPlaying(false)}
                className="pointer-events-auto absolute left-1.5 top-1.5 bg-black/75 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-amber transition-colors hover:bg-black"
              >
                ← Cover
              </button>
            ) : null}
            <span className="pointer-events-none absolute left-1.5 top-1.5 h-3 w-3 border-l-2 border-t-2 border-amber" />
            <span className="pointer-events-none absolute right-1.5 top-1.5 h-3 w-3 border-r-2 border-t-2 border-amber" />
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 h-3 w-3 border-b-2 border-l-2 border-amber" />
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 h-3 w-3 border-b-2 border-r-2 border-amber" />
            {hasVideo ? (
              <span className="pointer-events-none absolute right-1.5 top-6 bg-black/75 px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-onair">
                Downloaded
              </span>
            ) : null}
          </div>

          <div className="mt-2 truncate text-[13px] font-semibold leading-tight">{video.title}</div>

          {step === 1 ? (
            <>
              <div
                ref={stripRef}
                role="group"
                aria-label="Cover frames — drag to choose"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    pickCover(frame - 1);
                  }
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    pickCover(frame + 1);
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  onStripPointer(e, true);
                }}
                onPointerMove={(e) => onStripPointer(e, false)}
                onPointerUp={() => setDragging(false)}
                onPointerCancel={() => setDragging(false)}
                className="mt-3 grid cursor-ew-resize touch-none select-none grid-cols-6 gap-px border border-line bg-line outline-none focus-visible:border-amber"
              >
                {COVER_X.map((x, i) => (
                  <div
                    key={x}
                    className={`relative aspect-[9/16] overflow-hidden bg-black transition-opacity duration-150 ${
                      i === frame && !custom ? "opacity-100" : "opacity-45 hover:opacity-80"
                    }`}
                  >
                    <img
                      src={video.thumb}
                      alt=""
                      className="h-full w-full object-cover"
                      style={{ objectPosition: `${x}% 50%` }}
                    />
                    {i === frame && !custom ? (
                      <span className="absolute inset-0 border-2 border-amber" />
                    ) : null}
                    <span className="absolute bottom-0 left-0.5 font-mono text-[8px] text-white/70">
                      {i === 0 ? "OG" : i + 1}
                    </span>
                  </div>
                ))}
              </div>
              <div className="label mt-2">Drag to scrub · OG is the original</div>

              <div className="mt-2.5 flex gap-1.5">
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 border border-line bg-black/30 px-2 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber hover:text-amber">
                  <ImagePlus size={12} /> Upload my cover
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onCover(id!, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {custom ? (
                  <button
                    type="button"
                    onClick={() => onCover(id!, null)}
                    className="border border-line px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-amber hover:text-amber"
                  >
                    Use OG
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {/* ── step content ───────────────────────── */}
        <div className="min-w-0">
          {step === 1 ? (
            <div>
              <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.03em]">
                1 · Pick the cover
              </h2>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                The original cover from the video is showing now. Keep it, drag the strip to a
                different moment, or upload your own image — this is what people see in the feed
                before they play it.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 bg-amber px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#101216] transition-all hover:bg-[#ffc355] active:translate-y-px"
                >
                  Use this cover <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(id!)}
                  className="ml-auto flex items-center gap-1.5 border border-transparent px-2 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-fault/50 hover:text-fault"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.03em]">
                2 · Write the caption
              </h2>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                This is the text that appears under the reel on Instagram. Tap a hashtag to add it.
              </p>

              <div className="mt-4 flex items-baseline justify-between gap-3">
                <span className="label">Caption</span>
                <span className={`font-mono text-[11px] tabular-nums ${countTone}`}>
                  {len.toLocaleString()} / 2,200
                </span>
              </div>

              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={flushCaption}
                rows={8}
                aria-label="Caption"
                placeholder="What's this reel about? Write it like you'd say it…"
                className="mt-2 w-full resize-none border border-line bg-black/40 px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-amber"
              />

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {TAGS.map((t) => {
                  const on = caption.toLowerCase().includes(`#${t}`);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`border px-2 py-1 font-mono text-[10px] tracking-[0.08em] transition-colors ${
                        on
                          ? "border-amber bg-amber/15 text-amber"
                          : "border-line text-muted hover:border-amber/60 hover:text-ink"
                      }`}
                    >
                      #{t}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 border border-line bg-panel/60 px-3">
                <Toggle
                  checked={first}
                  onChange={(v) => {
                    setFirst(v);
                    onChange(id!, { firstComment: v });
                  }}
                  label="Post hashtags as the first comment"
                  hint="Keeps the caption clean — tags go under the reel as comment #1."
                />
                <Toggle
                  checked={story}
                  onChange={(v) => {
                    setStory(v);
                    onChange(id!, { shareToStory: v });
                  }}
                  label="Also share to my story"
                  hint="Cross-posts the reel to your Instagram story."
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-amber hover:text-amber"
                >
                  <ArrowLeft size={13} /> Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    flushCaption();
                    setStep(3);
                  }}
                  className="flex items-center gap-2 bg-amber px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#101216] transition-all hover:bg-[#ffc355] active:translate-y-px"
                >
                  Save caption <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.03em]">
                3 · When should it go out?
              </h2>
              <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                Pick a quick time, set your own, or send it straight to Instagram.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPickCustom(true)}
                  className="flex items-center justify-between border border-amber/60 bg-amber/10 px-4 py-4 text-left text-amber transition-colors hover:bg-amber hover:text-[#101216]"
                >
                  <span className="text-[15px] font-semibold">Schedule post</span>
                  <CalendarClock size={16} />
                </button>
                <button
                  type="button"
                  onClick={postNow}
                  disabled={busy}
                  className="flex items-center justify-between border border-onair/50 bg-onair/10 px-4 py-4 text-left text-onair transition-colors hover:bg-onair hover:text-[#101216] disabled:opacity-50"
                >
                  <span className="text-[15px] font-semibold">
                    {busy ? "Posting…" : "Post now"}
                  </span>
                  <Zap size={16} />
                </button>
              </div>

              {pickCustom ? (
                <div className="mt-4">
                  <div className="label mb-2">Pick the time</div>
                  <TimeSet value={sched} onChange={setSched} now={now} />
                  <button
                    type="button"
                    onClick={() => {
                      flushCaption();
                      const at = sched ?? new Date(Date.now() + 3600_000).toISOString();
                      onQueue(id!, at);
                      setStep(4);
                    }}
                    disabled={busy}
                    className="mt-3 flex items-center gap-2 bg-amber px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#101216] transition-all hover:bg-[#ffc355] active:translate-y-px disabled:opacity-50"
                  >
                    Confirm schedule <ArrowRight size={13} />
                  </button>
                </div>
              ) : (
                <p className="mt-3 max-w-[54ch] text-[12.5px] leading-relaxed text-muted">
                  <span className="text-ink">Schedule post</span> opens the time picker — 2 hours,
                  3 hours, tonight, tomorrow, or any time you set yourself.{" "}
                  <span className="text-ink">Post now</span> sends it straight to Instagram.
                </p>
              )}

              <div className="mt-4 border border-line bg-panel/60 px-3">
                <Toggle
                  checked={auto}
                  onChange={(v) => {
                    setAuto(v);
                    onChange(id!, { publishMode: v ? "auto" : "manual" });
                  }}
                  label={auto ? "Post automatically when the time comes" : "Ask me before posting"}
                  hint={
                    auto
                      ? "REELAY publishes on its own — no need to keep this page open."
                      : "When the time comes it waits for you to hit Post."
                  }
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-amber hover:text-amber"
                >
                  <ArrowLeft size={13} /> Back
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div>
              {video.status === "published" ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-onair/15 text-onair">
                    <Check size={26} />
                  </div>
                  <h2 className="mt-3 text-[30px] font-extrabold leading-none tracking-[-0.035em]">
                    Reel posted
                  </h2>
                  <p className="mt-2.5 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                    {video.igMediaId?.startsWith("SIM-")
                      ? "Everything worked, but no Instagram key is linked yet — this was a test post. Link Zernio on the Instagram page and it will go out for real."
                      : "It's live on Instagram. The cover, caption and hashtags went with it."}
                  </p>
                  <dl className="mt-4 grid max-w-[420px] grid-cols-[120px_minmax(0,1fr)] gap-y-2 font-mono text-[12px]">
                    <dt className="text-muted">Posted</dt>
                    <dd className="text-ink">
                      {dateLabel(video.publishedAt)} · {hhmm(video.publishedAt)}
                    </dd>
                    <dt className="text-muted">Media id</dt>
                    <dd className="truncate text-amber">{video.igMediaId ?? "—"}</dd>
                    <dt className="text-muted">Caption</dt>
                    <dd className="text-ink">{len} characters</dd>
                  </dl>
                </>
              ) : video.status === "failed" ? (
                <>
                  <h2 className="text-[30px] font-extrabold leading-none tracking-[-0.035em] text-fault">
                    It didn't post
                  </h2>
                  <p className="mt-2.5 max-w-[52ch] text-[13.5px] leading-relaxed text-fault">
                    {video.error ?? "Something went wrong."}
                  </p>
                  <button
                    type="button"
                    onClick={() => onPublish(id!)}
                    disabled={busy}
                    className="mt-4 border border-fault/60 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fault transition-colors hover:bg-fault hover:text-[#101216] disabled:opacity-50"
                  >
                    {busy ? "Trying…" : "Try again"}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber/15 text-amber">
                    <CalendarClock size={24} />
                  </div>
                  <h2 className="mt-3 text-[30px] font-extrabold leading-none tracking-[-0.035em]">
                    Reel scheduled
                  </h2>
                  <p className="mt-2.5 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
                    It will post by itself. You can close this page — the scheduler keeps running on
                    the server.
                  </p>
                  <div className="mt-4 font-mono text-[38px] leading-none tabular-nums text-amber">
                    {sched ? countdown(sched, now).replace("T-", "") : "--:--:--"}
                  </div>
                  <div className="label mt-2">
                    {sched
                      ? `${dateLabel(sched)} · ${hhmm(sched)} · ${
                          auto ? "posts automatically" : "waits for you to confirm"
                        }`
                      : "no time set"}
                  </div>
                </>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {video.status !== "published" && video.status !== "failed" ? (
                  <>
                    <button
                      type="button"
                      onClick={postNow}
                      disabled={busy}
                      className="flex items-center gap-2 bg-amber px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#101216] transition-all hover:bg-[#ffc355] active:translate-y-px disabled:opacity-50"
                    >
                      <Zap size={13} /> {busy ? "Posting…" : "Post now instead"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-amber hover:text-amber"
                    >
                      Change time
                    </button>
                    <button
                      type="button"
                      onClick={() => onQueue(id!, null)}
                      className="border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-fault hover:text-fault"
                    >
                      Remove from schedule
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onReset}
                      className="flex items-center gap-2 border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-amber hover:text-amber"
                    >
                      Start the next one
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="border border-line px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-amber hover:text-amber"
                    >
                      Edit this reel
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
