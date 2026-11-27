"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Env, VideoDTO } from "@/lib/types";
import { hhmmss } from "@/lib/ui";

type ApiResp = {
  videos?: VideoDTO[];
  env?: Env;
  video?: VideoDTO;
  error?: string;
  note?: string;
};

type ConsoleApi = {
  videos: VideoDTO[];
  env: Env | null;
  now: Date;
  loading: boolean;
  fault: string | null;
  busy: boolean;
  tickAt: string | null;
  flashId: string | null;
  toast: string | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  patch: (id: string, body: Record<string, unknown>) => Promise<VideoDTO | null>;
  publish: (id: string) => Promise<void>;
  queue: (id: string, scheduledAt: string | null) => Promise<void>;
  intake: (p: {
    url?: string;
    fileName?: string;
    file?: File;
    thumb?: string;
    duration?: number;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearHistory: (scope?: "history" | "all") => Promise<number>;
  uploadCover: (id: string, file: File | null) => Promise<void>;
  notify: (m: string) => void;
};

const Ctx = createContext<ConsoleApi | null>(null);

export function useConsole(): ConsoleApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return c;
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [videos, setVideos] = useState<VideoDTO[]>([]);
  const [env, setEnv] = useState<Env | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // epoch on the server and on the first client render so hydration matches;
  // the real clock is installed in the effect below
  const [now, setNow] = useState<Date>(() => new Date(0));
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fault, setFault] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tickAt, setTickAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const savingRef = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const merge = useCallback((d: ApiResp, skipVideos = false) => {
    if (!skipVideos && Array.isArray(d.videos)) setVideos(d.videos);
    if (d.env) setEnv(d.env);
  }, []);

  const notify = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 900);
  }, []);

  const absorb = useCallback((d: ApiResp) => {
    if (d.video) {
      const updated = d.video;
      setVideos((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    }
    if (d.env) setEnv(d.env);
  }, []);

  useEffect(() => {
    setNow(new Date());
    let alive = true;
    fetch("/api/videos")
      .then((r) => r.json())
      .then((d: ApiResp) => {
        if (!alive) return;
        merge(d);
        setLoading(false);
        if (d.error) setFault(d.error);
      })
      .catch(() => {
        if (!alive) return;
        setFault("Console API unreachable");
        setLoading(false);
      });

    const tick = setInterval(() => {
      fetch("/api/tick", {
        headers:
          typeof window !== "undefined" ? { "x-site-origin": window.location.origin } : undefined,
      })
        .then((r) => r.json())
        .then((d: ApiResp) => {
          if (!alive) return;
          merge(d, savingRef.current);
          setTickAt(hhmmss(new Date()));
          if (d.error) setFault(d.error);
        })
        .catch(() => undefined);
    }, 5000);

    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      alive = false;
      clearInterval(tick);
      clearInterval(clock);
    };
  }, [merge]);

  // open the first clip once the inbox has loaded (never re-select after that)
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current || loading || !videos.length) return;
    bootstrapped.current = true;
    setSelectedId((prev) => prev ?? videos[0].id);
  }, [videos, loading]);

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      savingRef.current = true;
      try {
        const r = await fetch(`/api/videos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = (await r.json()) as ApiResp;
        if (!r.ok) {
          notify(d.error ?? "Save failed");
          return null;
        }
        absorb(d);
        return d.video ?? null;
      } catch {
        notify("Save failed — network");
        return null;
      } finally {
        savingRef.current = false;
      }
    },
    [absorb, notify],
  );

  const publish = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const r = await fetch(`/api/videos/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "publish" }),
        });
        const d = (await r.json()) as ApiResp;
        if (!r.ok) {
          notify(d.error ?? "Publish failed");
          return;
        }
        merge(d);
        const v = d.video;
        if (v) {
          flash(v.id);
          notify(
            v.status === "published"
              ? v.igMediaId?.startsWith("SIM-")
                ? "Posted — SIMULATED (no IG_ACCESS_TOKEN set)"
                : "Posted to Instagram"
              : `Publish fault: ${v.error ?? "unknown"}`,
          );
        }
      } catch {
        notify("Publish failed — network");
      } finally {
        setBusy(false);
      }
    },
    [flash, merge, notify],
  );

  const queue = useCallback(
    async (id: string, scheduledAt: string | null) => {
      const v = await patch(id, { status: scheduledAt ? "scheduled" : "ready", scheduledAt });
      if (v && scheduledAt) {
        flash(id);
        notify(
          `Scheduled for ${new Date(scheduledAt).toLocaleString([], {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
        );
      } else if (v) {
        notify("Removed from the schedule");
      }
    },
    [flash, notify, patch],
  );

  const intake = useCallback(
    async (payload: {
      url?: string;
      fileName?: string;
      file?: File;
      thumb?: string;
      duration?: number;
    }) => {
      try {
        // a real file must be sent as multipart — the bytes, not the filename
        let r: Response;
        if (payload.file) {
          const fd = new FormData();
          fd.append("file", payload.file);
          if (payload.thumb) fd.append("thumb", payload.thumb);
          if (payload.duration) fd.append("duration", String(payload.duration));
          r = await fetch("/api/videos/upload", { method: "POST", body: fd });
        } else {
          r = await fetch("/api/videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: payload.url, fileName: payload.fileName }),
          });
        }
        const d = (await r.json()) as ApiResp;
        if (!r.ok) {
          notify(d.error ?? "Intake failed");
          return;
        }
        merge(d);
        if (d.video) {
          setSelectedId(d.video.id);
          flash(d.video.id);
        }
        notify(d.note ?? "Landed in intake");
      } catch {
        notify("Intake failed — network");
      }
    },
    [flash, merge, notify],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const r = await fetch(`/api/videos/${id}`, { method: "DELETE" });
        const d = (await r.json()) as ApiResp;
        if (!r.ok) {
          notify(d.error ?? "Delete failed");
          return;
        }
        merge(d);
        setSelectedId((prev) => (prev === id ? null : prev));
        notify("Clip pulled from the rail");
      } catch {
        notify("Delete failed — network");
      }
    },
    [merge, notify],
  );

  const clearHistory = useCallback(
    async (scope: "history" | "all" = "history") => {
      try {
        const r = await fetch("/api/videos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        });
        const d = (await r.json()) as ApiResp & { removed?: number };
        if (!r.ok) {
          notify(d.error ?? "Could not clear");
          return 0;
        }
        merge(d);
        notify(`Cleared ${d.removed ?? 0} ${scope === "all" ? "clips" : "history entries"}`);
        return d.removed ?? 0;
      } catch {
        notify("Could not clear — network");
        return 0;
      }
    },
    [merge, notify],
  );

  const uploadCover = useCallback(
    async (id: string, file: File | null) => {
      savingRef.current = true; // keep the 5s poll from clobbering the row mid-upload
      try {
        const fd = new FormData();
        if (file) fd.append("file", file);
        const r = await fetch(`/api/videos/${id}/cover`, { method: "POST", body: fd });
        const d = (await r.json()) as ApiResp;
        if (!r.ok) {
          notify(d.error ?? "Cover upload failed");
          return;
        }
        absorb(d);
        notify(file ? "Custom cover applied" : "Back to the scrubbed frame");
      } catch {
        notify("Cover upload failed — network");
      } finally {
        savingRef.current = false;
      }
    },
    [absorb, notify],
  );

  const value: ConsoleApi = {
    videos,
    env,
    now,
    loading,
    fault,
    busy,
    tickAt,
    flashId,
    toast,
    selectedId,
    setSelectedId,
    patch,
    publish,
    queue,
    intake,
    remove,
    clearHistory,
    uploadCover,
    notify,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
