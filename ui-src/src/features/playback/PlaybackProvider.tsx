import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, RefreshCw, RotateCcw, RotateCw, X } from "lucide-react";
import { getJobAudio, type Job } from "@/lib/api";

type PlaybackItem = Pick<Job, "request_id" | "text" | "voice_name" | "audio_duration_s" | "file_available">;
type PlaybackContextValue = {
  current: PlaybackItem | null;
  playing: boolean;
  play: (job: PlaybackItem) => Promise<void>;
  pause: () => void;
  clear: () => void;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);
const STORAGE_KEY = "vox:last-playback-item";

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [current, setCurrent] = useState<PlaybackItem | null>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as PlaybackItem | null; } catch { return null; }
  });
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("vox:player-volume") ?? 1));
  const [rate, setRate] = useState(() => Number(localStorage.getItem("vox:player-rate") ?? 1));

  const revokeUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clear = useCallback(() => {
    audioRef.current?.pause();
    revokeUrl();
    setCurrent(null);
    setPlaying(false);
    setPosition(0);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [revokeUrl]);

  const play = useCallback(async (job: PlaybackItem) => {
    setLoading(true);
    setError(null);
    try {
      const blob = await getJobAudio(job.request_id);
      revokeUrl();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setCurrent(job);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      audio.playbackRate = rate;
      audio.volume = volume;
      await audio.play();
    } catch {
      setCurrent(job);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(job));
      setError("Audio is unavailable. It may have expired or been deleted.");
    } finally {
      setLoading(false);
    }
  }, [rate, revokeUrl, volume]);

  useEffect(() => {
    const handler = (event: Event) => {
      const job = (event as CustomEvent<PlaybackItem>).detail;
      if (job) void play(job);
    };
    window.addEventListener("vox:play-job", handler);
    const deleted = (event: Event) => {
      if ((event as CustomEvent<{ requestId: string }>).detail?.requestId === current?.request_id) clear();
    };
    window.addEventListener("vox:job-deleted", deleted);
    return () => { window.removeEventListener("vox:play-job", handler); window.removeEventListener("vox:job-deleted", deleted); };
  }, [clear, current?.request_id, play]);
  useEffect(() => () => revokeUrl(), [revokeUrl]);

  const value = useMemo<PlaybackContextValue>(() => ({
    current,
    playing,
    play,
    pause: () => audioRef.current?.pause(),
    clear,
  }), [clear, current, play, playing]);

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
        <section aria-label="Audio player" className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-white/95 p-3 shadow-[0_-12px_30px_-24px_rgba(15,23,42,.4)] backdrop-blur-xl md:bottom-0 md:left-[216px]">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3">
            <button type="button" onClick={() => { if (playing) audioRef.current?.pause(); else void audioRef.current?.play(); }} aria-label={playing ? "Pause" : "Play"} disabled={loading || !objectUrlRef.current} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <div className="hidden min-w-0 w-48 sm:block">
              <div className="truncate text-sm font-semibold">{titleFor(current.text)}</div>
              <div className="truncate text-xs text-foreground/55">{current.voice_name ?? "Default voice"}</div>
              {error && <div className="truncate text-[11px] text-red-600">{error}</div>}
            </div>
            <button type="button" aria-label="Back 10 seconds" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }} className="hidden h-10 w-10 items-center justify-center rounded-lg hover:bg-muted sm:flex"><RotateCcw className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="global-player-seek">Seek audio</label>
              <input id="global-player-seek" type="range" min={0} max={duration || current.audio_duration_s || 0} step="0.1" value={Math.min(position, duration || 0)} onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} className="w-full accent-[var(--brand)]" />
              <div className="flex justify-between text-[11px] tabular-nums text-foreground/50"><span>{formatTime(position)}</span><span>{formatTime(duration || current.audio_duration_s || 0)}</span></div>
            </div>
            <button type="button" aria-label="Forward 10 seconds" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10); }} className="hidden h-10 w-10 items-center justify-center rounded-lg hover:bg-muted sm:flex"><RotateCw className="h-4 w-4" /></button>
            <select aria-label="Playback speed" value={rate} onChange={(event) => { const next = Number(event.target.value); setRate(next); localStorage.setItem("vox:player-rate", String(next)); if (audioRef.current) audioRef.current.playbackRate = next; }} className="hidden rounded-lg border border-border bg-white px-2 py-2 text-xs md:block"><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select>
            <label className="sr-only" htmlFor="global-player-volume">Volume</label>
            <input id="global-player-volume" type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => { const next = Number(event.target.value); setVolume(next); localStorage.setItem("vox:player-volume", String(next)); if (audioRef.current) audioRef.current.volume = next; }} className="hidden w-20 accent-[var(--brand)] lg:block" />
            <a href={`/api/v1/jobs/${encodeURIComponent(current.request_id)}/audio`} download aria-label="Download audio" className="hidden h-10 w-10 items-center justify-center rounded-lg hover:bg-muted sm:flex"><Download className="h-4 w-4" /></a>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("vox:regenerate-job", { detail: current }))} aria-label="Regenerate audio" className="hidden h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--brand)] hover:bg-muted lg:flex"><RefreshCw className="h-4 w-4" />Regenerate</button>
            <button type="button" onClick={clear} aria-label="Close player" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
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

function titleFor(text: string) {
  return text.trim().split(/[.!?\n]/)[0]?.slice(0, 64) || "Untitled recording";
}

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
