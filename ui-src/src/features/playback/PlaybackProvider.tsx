import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, Pause, Play, RefreshCw, RotateCcw, RotateCw, X } from "lucide-react";
import { getJobAudio, type Job } from "@/lib/api";

type PlaybackItem = Pick<Job, "request_id" | "text" | "voice_name" | "audio_duration_s" | "file_available">;
type PlaybackContextValue = {
  current: PlaybackItem | null;
  playing: boolean;
  loading: boolean;
  pendingRequestId: string | null;
  position: number;
  duration: number;
  volume: number;
  rate: number;
  play: (job: PlaybackItem) => Promise<void>;
  resume: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  setRate: (value: number) => void;
  clear: () => void;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);
const STORAGE_KEY = "vox:last-playback-item";

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const operationRef = useRef(0);
  const resumeAfterDeleteRef = useRef(false);
  const lastAudibleVolumeRef = useRef(1);
  const [current, setCurrent] = useState<PlaybackItem | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as PlaybackItem | null; } catch { return null; }
  });
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("vox:player-volume") ?? 1));
  const [rate, setRate] = useState(() => Number(localStorage.getItem("vox:player-rate") ?? 1));
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const currentRef = useRef<PlaybackItem | null>(current);
  const playingRef = useRef(playing);
  currentRef.current = current;
  playingRef.current = playing;

  const revokeUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clear = useCallback(() => {
    operationRef.current += 1;
    audioRef.current?.pause();
    revokeUrl();
    setCurrent(null);
    setPlaying(false);
    setLoading(false);
    setPendingRequestId(null);
    setPosition(0);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [revokeUrl]);

  const play = useCallback(async (job: PlaybackItem) => {
    const operation = ++operationRef.current;
    audioRef.current?.pause();
    revokeUrl();
    setPlaying(false);
    setLoading(true);
    setPendingRequestId(job.request_id);
    setError(null);
    try {
      const blob = await getJobAudio(job.request_id);
      const url = URL.createObjectURL(blob);
      if (operation !== operationRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      objectUrlRef.current = url;
      setCurrent(job);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      audio.playbackRate = rate;
      audio.volume = volume;
      await audio.play();
    } catch (caught) {
      if (operation !== operationRef.current) return;
      const status = (caught as { status?: number })?.status;
      if (status === 404 || status === 410) {
        const unavailable = { ...job, file_available: false };
        setCurrent(unavailable);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(unavailable));
        setError("Audio is unavailable. It may have expired or been deleted.");
      } else {
        setError("Playback could not start. Press Play to try again.");
        setPlaying(false);
      }
    } finally {
      if (operation === operationRef.current) {
        setLoading(false);
        setPendingRequestId(null);
      }
    }
  }, [rate, revokeUrl, volume]);
  const resume = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !objectUrlRef.current) {
      if (current) await play(current);
      return;
    }
    try { await audio.play(); } catch { setError("Playback could not start. Press Play to try again."); }
  }, [current, play]);

  useEffect(() => {
    const handler = (event: Event) => {
      const job = (event as CustomEvent<PlaybackItem>).detail;
      if (job) void play(job);
    };
    window.addEventListener("vox:play-job", handler);
    const deleted = (event: Event) => {
      if ((event as CustomEvent<{ requestId: string }>).detail?.requestId === currentRef.current?.request_id) clear();
    };
    const deleting = (event: Event) => {
      if ((event as CustomEvent<{ requestId: string }>).detail?.requestId === currentRef.current?.request_id) {
        resumeAfterDeleteRef.current = playingRef.current;
        audioRef.current?.pause();
      }
    };
    const deleteFailed = (event: Event) => {
      if ((event as CustomEvent<{ requestId: string }>).detail?.requestId === currentRef.current?.request_id && resumeAfterDeleteRef.current) void audioRef.current?.play();
      resumeAfterDeleteRef.current = false;
    };
    window.addEventListener("vox:job-deleted", deleted);
    window.addEventListener("vox:job-deleting", deleting);
    window.addEventListener("vox:job-delete-failed", deleteFailed);
    return () => { window.removeEventListener("vox:play-job", handler); window.removeEventListener("vox:job-deleted", deleted); window.removeEventListener("vox:job-deleting", deleting); window.removeEventListener("vox:job-delete-failed", deleteFailed); };
  }, [clear, play]);
  useEffect(() => () => revokeUrl(), [revokeUrl]);

  const updateVolume = useCallback((value: number) => {
    if (value > 0) lastAudibleVolumeRef.current = value;
    setVolume(value);
    localStorage.setItem("vox:player-volume", String(value));
    if (audioRef.current) audioRef.current.volume = value;
  }, []);
  const toggleMute = useCallback(() => {
    updateVolume(volume > 0 ? 0 : lastAudibleVolumeRef.current);
  }, [updateVolume, volume]);
  const updateRate = useCallback((value: number) => {
    setRate(value);
    localStorage.setItem("vox:player-rate", String(value));
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);
  const value = useMemo<PlaybackContextValue>(() => ({
    current, playing, loading, pendingRequestId, position, duration, volume, rate, play, resume,
    pause: () => audioRef.current?.pause(),
    seek: (seconds) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(seconds, duration || seconds)); },
    setVolume: updateVolume,
    toggleMute,
    setRate: updateRate,
    clear,
  }), [clear, current, duration, loading, pendingRequestId, play, playing, position, rate, resume, toggleMute, updateRate, updateVolume, volume]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
      />
      {current && (
        <section aria-label="Audio player" className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-white/95 p-3 shadow-[0_-12px_30px_-24px_rgba(15,23,42,.4)] backdrop-blur-xl md:bottom-0 md:left-[68px] xl:left-[216px]">
          <div className="mx-auto hidden max-w-[1400px] items-center gap-3 sm:flex">
            <button type="button" onClick={() => { if (playing) audioRef.current?.pause(); else if (objectUrlRef.current) void audioRef.current?.play(); else void play(current); }} aria-label={playing ? "Pause" : "Play"} disabled={loading || current.file_available === false} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <div className="hidden min-w-0 w-48 sm:block">
              <div className="truncate text-sm font-semibold">{titleFor(current.text)}</div>
              <div className="truncate text-xs text-foreground/55">{current.voice_name ?? "Default voice"}</div>
              {error && <div className="truncate text-[11px] text-red-600">{error}</div>}
            </div>
            <div className="min-w-0 flex-1 sm:hidden"><div className="truncate text-sm font-semibold">{titleFor(current.text)}</div><div className="truncate text-xs text-foreground/55">{current.voice_name ?? "Default voice"}{error ? " · Audio unavailable" : ""}</div></div>
            <button type="button" aria-label="Back 10 seconds" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }} className="hidden h-10 w-10 items-center justify-center rounded-lg hover:bg-muted sm:flex"><RotateCcw className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1">
              <QuickPlayerWaveform
                requestId={current.request_id}
                progress={position}
                duration={duration || current.audio_duration_s || 0}
                onSeek={(seconds) => {
                  if (audioRef.current) audioRef.current.currentTime = seconds;
                }}
              />
              <label className="sr-only" htmlFor="global-player-seek">Seek audio</label>
              <input id="global-player-seek" type="range" min={0} max={duration || current.audio_duration_s || 0} step="0.1" value={Math.min(position, duration || 0)} onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} className="w-full accent-[var(--brand)]" />
              <div className="flex justify-between text-[11px] tabular-nums text-foreground/50"><span>{formatTime(position)}</span><span>{formatTime(duration || current.audio_duration_s || 0)}</span></div>
            </div>
            <button type="button" aria-label="Forward 10 seconds" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10); }} className="hidden h-10 w-10 items-center justify-center rounded-lg hover:bg-muted sm:flex"><RotateCw className="h-4 w-4" /></button>
            <select aria-label="Playback speed" value={rate} onChange={(event) => updateRate(Number(event.target.value))} className="hidden rounded-lg border border-border bg-white px-2 py-2 text-xs md:block"><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select>
            <label className="sr-only" htmlFor="global-player-volume">Volume</label>
            <input id="global-player-volume" type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => updateVolume(Number(event.target.value))} className="hidden w-20 accent-[var(--brand)] lg:block" />
            {current.file_available !== false && <a href={`/api/v1/jobs/${encodeURIComponent(current.request_id)}/audio`} download aria-label="Download audio" className="hidden h-10 w-10 items-center justify-center rounded-lg hover:bg-muted sm:flex"><Download className="h-4 w-4" /></a>}
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("vox:regenerate-job", { detail: current }))} aria-label="Regenerate audio" className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--brand)] hover:bg-muted sm:px-3"><RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Regenerate</span></button>
            <button type="button" onClick={clear} aria-label="Close player" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="mx-auto flex max-w-[640px] flex-col gap-2 sm:hidden">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { if (playing) audioRef.current?.pause(); else if (objectUrlRef.current) void audioRef.current?.play(); else void play(current); }} aria-label={playing ? "Pause" : "Play"} disabled={loading || current.file_available === false} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40">
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{titleFor(current.text)}</div><div className="truncate text-xs text-foreground/55">{current.voice_name ?? "Default voice"}{error ? " · Playback issue" : ""}</div></div>
              <button type="button" aria-label={mobileExpanded ? "Collapse player" : "Expand player"} onClick={() => setMobileExpanded((expanded) => !expanded)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted">{mobileExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}</button>
              <button type="button" onClick={clear} aria-label="Close player" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            {mobileExpanded && <div className="border-t border-border pt-3">
              <label className="sr-only" htmlFor="mobile-player-seek">Seek audio</label>
              <input id="mobile-player-seek" aria-label="Mobile seek audio" type="range" min={0} max={duration || current.audio_duration_s || 0} step="0.1" value={Math.min(position, duration || 0)} onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} className="w-full accent-[var(--brand)]" />
              <div className="flex justify-between text-[11px] tabular-nums text-foreground/50"><span>{formatTime(position)}</span><span>{formatTime(duration || current.audio_duration_s || 0)}</span></div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" aria-label="Back 10 seconds" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border"><RotateCcw className="h-4 w-4" /></button>
                <button type="button" aria-label="Forward 10 seconds" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10); }} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border"><RotateCw className="h-4 w-4" /></button>
                <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("vox:regenerate-job", { detail: current }))} className="flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-[var(--brand)]"><RefreshCw className="h-4 w-4" />Regenerate</button>
                {current.file_available !== false && <a href={`/api/v1/jobs/${encodeURIComponent(current.request_id)}/audio`} download aria-label="Download audio" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border"><Download className="h-4 w-4" /></a>}
              </div>
            </div>}
          </div>
        </section>
      )}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("usePlayback must be used inside PlaybackProvider");
  return value;
}

export function requestPlayback(job: PlaybackItem) {
  window.dispatchEvent(new CustomEvent("vox:play-job", { detail: job }));
}

export function notifyJobDeleting(requestId: string) {
  window.dispatchEvent(new CustomEvent("vox:job-deleting", { detail: { requestId } }));
}

export function notifyJobDeleted(requestId: string) {
  window.dispatchEvent(new CustomEvent("vox:job-deleted", { detail: { requestId } }));
}

export function notifyJobDeleteFailed(requestId: string) {
  window.dispatchEvent(new CustomEvent("vox:job-delete-failed", { detail: { requestId } }));
}

function titleFor(text: string) {
  return text.trim().split(/[.!?\n]/)[0]?.slice(0, 64) || "Untitled recording";
}

function QuickPlayerWaveform({
  requestId,
  progress,
  duration,
  onSeek,
}: {
  requestId: string;
  progress: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const peaks = useMemo(() => speechPeaks(72, requestId), [requestId]);
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;

  return (
    <div
      data-testid="quick-player-waveform"
      className="relative mb-1 hidden h-7 overflow-hidden rounded-md border border-border bg-[oklch(0.99_0.005_280)] sm:block"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.5), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.45), transparent 60%)" }}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 240 30"
        preserveAspectRatio="none"
        className="relative block h-full w-full cursor-pointer"
        onClick={(event) => {
          if (!duration) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          onSeek(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * duration);
        }}
      >
        <defs>
          <linearGradient id="quick-player-wave-gradient" x1="0" x2="1">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="0.55" stopColor="var(--brand-secondary)" />
            <stop offset="1" stopColor="var(--brand-warm)" />
          </linearGradient>
        </defs>
        {peaks.map((peak, index) => {
          const barWidth = 2;
          const gap = 1.35;
          const x = index * (barWidth + gap);
          const height = Math.max(3, peak * 25);
          return (
            <rect
              key={index}
              x={x}
              y={(30 - height) / 2}
              width={barWidth}
              height={height}
              rx="1"
              fill={(index + 1) / peaks.length <= progressRatio ? "url(#quick-player-wave-gradient)" : "oklch(0.55 0.04 240 / 0.3)"}
            />
          );
        })}
        {duration > 0 && <line x1={progressRatio * 240} y1="3" x2={progressRatio * 240} y2="27" stroke="var(--brand-warm)" strokeWidth="1.4" />}
      </svg>
    </div>
  );
}

function speechPeaks(count: number, seed: string): number[] {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const random = () => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return ((hash >>> 0) % 10_000) / 10_000;
  };
  return Array.from({ length: count }, () => 0.2 + random() * 0.8);
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
