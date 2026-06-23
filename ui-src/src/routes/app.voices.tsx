import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Search,
  RefreshCw,
  UploadCloud,
  Play,
  Square,
  MoreVertical,
  Volume2,
  VolumeX,
  Mic,
  Star,
  Pencil,
  Download,
  Trash2,
  Info,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/app/voices")({
  head: () => ({ meta: [{ title: "Voices — Vox Studio" }] }),
  component: VoicesPage,
});

type VoiceProfile = {
  id: string;
  name: string;
  isDefault?: boolean;
  tags: string[];
  source: "Local";
  lastUsed: string;
  defaultTone: string;
  duration: string;
};

const PROFILES: VoiceProfile[] = [
  { id: "noelmo", name: "Noelmo Normal", isDefault: true, tags: ["Clear", "Neutral", "Narration"], source: "Local", lastUsed: "2 mins ago", defaultTone: "Neutral", duration: "0:06" },
  { id: "generic", name: "Generic", tags: ["Clear", "Neutral"], source: "Local", lastUsed: "1 hour ago", defaultTone: "Neutral", duration: "0:05" },
  { id: "dracula", name: "Dracula", tags: ["Dramatic", "Deep", "Gothic"], source: "Local", lastUsed: "Yesterday", defaultTone: "Dramatic", duration: "0:06" },
  { id: "sherlock", name: "Sherlock Holmes", tags: ["Clear", "British", "Narration"], source: "Local", lastUsed: "2 days ago", defaultTone: "Neutral", duration: "0:05" },
  { id: "pride", name: "Pride and Prejudice", tags: ["Warm", "British", "Classic"], source: "Local", lastUsed: "3 days ago", defaultTone: "Warm", duration: "0:05" },
  { id: "moby", name: "Moby Dick", tags: ["Deep", "Rugged", "Narration"], source: "Local", lastUsed: "1 week ago", defaultTone: "Neutral", duration: "0:06" },
];

function VoicesPage() {
  const [mode, setMode] = useState<"upload" | "record">("record");
  const [query, setQuery] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [tags, setTags] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = PROFILES.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-black tracking-tight text-foreground">Voices</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-white p-1 shadow-sm">
            <button
              onClick={() => setMode("upload")}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all " +
                (mode === "upload"
                  ? "bg-gradient-to-br from-[oklch(0.72_0.17_150)] to-[oklch(0.55_0.18_150)] text-white shadow-[0_2px_8px_oklch(0.55_0.18_150/0.35)]"
                  : "text-foreground/60 hover:bg-[oklch(0.96_0.04_150)] hover:text-[oklch(0.5_0.18_150)]")
              }
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Upload
            </button>
            <button
              onClick={() => setMode("record")}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all " +
                (mode === "record"
                  ? "bg-gradient-to-br from-[oklch(0.7_0.2_25)] to-[oklch(0.55_0.22_25)] text-white shadow-[0_2px_8px_oklch(0.55_0.22_25/0.4)]"
                  : "text-foreground/60 hover:bg-[oklch(0.96_0.04_25)] hover:text-[oklch(0.55_0.22_25)]")
              }
            >
              <span className="relative flex h-2 w-2">
                {mode === "record" && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
                )}
                <span className={"relative h-2 w-2 rounded-full " + (mode === "record" ? "bg-white" : "bg-[oklch(0.6_0.22_25)]")} />
              </span>
              Record
            </button>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium text-foreground/80 hover:bg-muted">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>


      {/* Upload / Record panel */}
      <section className="rounded-2xl border border-border bg-white p-6">
        {mode === "upload" ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_280px]">
            <div>
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFileName(f.name);
                }}
                className={
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors " +
                  (dragOver
                    ? "border-[oklch(0.55_0.22_260)] bg-[oklch(0.98_0.02_260)]"
                    : "border-border bg-[oklch(0.985_0.005_260)] hover:bg-muted/40")
                }
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".wav,.m4a,.mp3,.aiff,.flac,.ogg,audio/*"
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                />
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(0.95_0.04_260)]">
                  <UploadCloud className="h-5 w-5 text-[oklch(0.55_0.22_260)]" />
                </span>
                <div className="mt-4 text-[15px] font-semibold text-foreground">Upload voice sample</div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  Drag and drop an audio file, or click to browse.
                </div>
                <div className="mt-3 text-[12px] tracking-wide text-muted-foreground/80">
                  WAV, M4A, MP3, AIFF, FLAC, OGG
                </div>
              </label>
              <div className="mt-2 text-[12px] text-muted-foreground">Short, clean samples work best.</div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[13px] font-semibold text-foreground">Voice name</label>
                <input
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="e.g. My Narrator"
                  className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]"
                />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-foreground">
                  Tags <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. narration, calm, male"
                  className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]"
                />
                <div className="mt-1 text-[11.5px] text-muted-foreground">Press Enter to add tags</div>
              </div>
              <button
                className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-all hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
                  boxShadow:
                    "0 10px 24px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
                }}
              >
                Create Voice Profile
              </button>
            </div>
          </div>
        ) : (
          <RecordPane />
        )}

        {/* Progress + waveform (upload only) */}
        {mode === "upload" && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="truncate text-foreground/75">{fileName ?? "No file selected"}</span>
                  <span className="text-muted-foreground tabular-nums">0%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-0 bg-[oklch(0.55_0.22_260)]" />
                </div>
              </div>
              <button
                onClick={() => { setFileName(null); if (fileRef.current) fileRef.current.value = ""; }}
                className="shrink-0 rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-medium text-foreground/75 hover:bg-muted"
              >
                Clear
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-[oklch(0.985_0.005_260)] px-3 py-3">
              <button
                aria-label="Play sample"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[oklch(0.95_0.04_260)] text-[oklch(0.55_0.22_260)] hover:bg-[oklch(0.92_0.05_260)]"
              >
                <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
              </button>
              <span className="text-[11.5px] tabular-nums text-muted-foreground">0:06</span>
              <Waveform />
              <span className="text-[11.5px] tabular-nums text-muted-foreground">0:00</span>
              <VolumeControl />
            </div>
          </div>
        )}
      </section>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voice profiles…"
          className="w-full rounded-2xl border border-border bg-white py-3 pl-10 pr-4 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]"
        />
      </div>

      {/* Profiles grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {filtered.map((p) => (
          <ProfileCard key={p.id} profile={p} />
        ))}
      </div>

      <div className="text-center text-[12px] text-muted-foreground">
        Showing {filtered.length} of {PROFILES.length} voice profiles
      </div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: VoiceProfile }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start gap-3">
        <button
          aria-label={`Play ${profile.name}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[oklch(0.95_0.04_260)] text-[oklch(0.55_0.22_260)] hover:bg-[oklch(0.92_0.05_260)]"
        >
          <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold text-foreground">{profile.name}</span>
            {profile.isDefault && (
              <span className="rounded-md bg-[oklch(0.95_0.04_260)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[oklch(0.55_0.22_260)]">
                Default
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {profile.tags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/70"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button className="rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground/80 hover:bg-muted">
            Use
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="More options"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground/60 hover:bg-muted"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 border-border bg-white text-foreground shadow-lg">
              <DropdownMenuItem disabled={profile.isDefault}>
                <Star className="mr-2 h-3.5 w-3.5" />
                Set as default
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download className="mr-2 h-3.5 w-3.5" />
                Download sample
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-[oklch(0.55_0.22_25)] focus:text-[oklch(0.5_0.22_25)]">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
        <Meta label="Source" value={profile.source} />
        <Meta label="Last used" value={profile.lastUsed} />
        <Meta label="Default tone" value={profile.defaultTone} />
        <div className="flex items-center gap-2">
          <MiniWave />
          <span className="text-[11px] tabular-nums text-muted-foreground">{profile.duration}</span>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-[12.5px] font-medium text-foreground/85">{value}</div>
    </div>
  );
}

function Waveform({ animated = false }: { animated?: boolean }) {
  const bars = 64;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!animated) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 120);
    return () => window.clearInterval(id);
  }, [animated]);
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => {
        const seed = animated ? i * 0.7 + tick * 0.4 : i * 0.7;
        const h = 20 + Math.abs(Math.sin(seed)) * 70 + (i % 5) * 4;
        return (
          <span
            key={i}
            className="block min-w-[2px] flex-1 rounded-full bg-[oklch(0.55_0.22_260)]/55"
            style={{ height: `${Math.min(100, h)}%` }}
          />
        );
      })}
    </div>
  );
}

function MiniWave() {
  const heights = [30, 55, 40, 80, 60, 90, 50, 70, 35, 65, 45, 75, 30, 55];
  return (
    <div className="flex h-5 items-center gap-[1.5px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="block w-[2px] rounded-full bg-[oklch(0.55_0.22_260)]/55"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function VolumeControl() {
  const [volume, setVolume] = useState(0.7);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const muted = volume === 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={muted ? "Unmute" : "Volume"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-foreground/60 hover:bg-muted hover:text-foreground"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 flex h-28 w-9 flex-col items-center justify-center rounded-lg border border-border bg-white py-3 shadow-lg"
          style={{ boxShadow: "0 6px 24px oklch(0.16 0.02 260 / 0.12)" }}
        >
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="cursor-pointer appearance-none rounded-full accent-[oklch(0.55_0.22_260)]"
            style={{
              writingMode: "vertical-lr" as never,
              WebkitAppearance: "slider-vertical" as never,
              direction: "rtl",
              background: `linear-gradient(to top, oklch(0.55 0.22 260) 0%, oklch(0.55 0.22 260) ${volume * 100}%, oklch(0.92 0.01 260) ${volume * 100}%, oklch(0.92 0.01 260) 100%)`,
              width: "6px",
              height: "80px",
            }}
          />
        </div>
      )}
    </div>
  );
}

function RecordPane() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const MAX = 5 * 60;

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      setElapsed((e) => (e + 1 >= MAX ? (setRecording(false), MAX) : e + 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-border bg-[oklch(0.985_0.005_260)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-foreground">Record voice sample</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Speak clearly in a quiet environment.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-medium text-foreground/80 hover:bg-muted">
          Change mic
        </button>
      </div>

      <div className="mt-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-[oklch(0.55_0.18_145)]">
        <Mic className="h-3.5 w-3.5" />
        Microphone access granted
        <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.7_0.18_145)]" />
      </div>

      {/* Big record button */}
      <div className="mt-6 flex flex-col items-center">
        <button
          onClick={() => setRecording((r) => !r)}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={
            "relative flex h-28 w-28 items-center justify-center rounded-full border-[6px] transition-all " +
            (recording
              ? "border-[oklch(0.92_0.04_25)] bg-white"
              : "border-[oklch(0.94_0.02_260)] bg-white hover:border-[oklch(0.9_0.04_25)]")
          }
        >
          {recording && (
            <span className="absolute inset-0 -m-1 animate-ping rounded-full border-2 border-[oklch(0.65_0.22_25)]/40" />
          )}
          {recording ? (
            <span className="h-10 w-10 rounded-md bg-[oklch(0.6_0.22_25)]" />
          ) : (
            <span className="h-14 w-14 rounded-full bg-[oklch(0.6_0.22_25)]" />
          )}
        </button>

        <div className="mt-4 text-center">
          <div className="text-[18px] font-bold tabular-nums text-foreground">
            {fmt(elapsed)} <span className="font-medium text-muted-foreground">/ {fmt(MAX)}</span>
          </div>
          <div className="mt-0.5 inline-flex items-center justify-center gap-1 text-[12px] text-muted-foreground">
            5 min max
            <span className="group relative inline-flex">
              <Info className="h-3 w-3 cursor-help text-muted-foreground/70" />
              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11.5px] font-normal leading-snug text-foreground/80 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                A clean ~30 second recording is enough for most use cases.
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Waveform */}
      <div className="mt-5">
        <Waveform animated={recording} />
      </div>

      {/* Actions */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_1.4fr]">
        <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[oklch(0.55_0.22_260)] hover:bg-muted">
          <Play className="h-3.5 w-3.5" fill="currentColor" />
          Play Preview
        </button>
        <button
          onClick={() => setRecording(false)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[oklch(0.6_0.22_25)] hover:bg-muted"
        >
          <Square className="h-3.5 w-3.5" fill="currentColor" />
          Stop
        </button>
        <button
          onClick={() => { setRecording(false); setElapsed(0); }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-foreground/70 hover:bg-muted"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Discard
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white transition-all hover:brightness-110"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
            boxShadow:
              "0 10px 24px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
          }}
        >
          Save as Voice Profile
        </button>
      </div>
    </div>
  );
}
