import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  RefreshCw,
  UploadCloud,
  Play,
  Pause,
  Square,
  MoreVertical,
  Mic,
  Download,
  Trash2,
  Info,
  Loader2,
  Check,
  X,
  AlertCircle,
  Globe,
  ImagePlus,
  Clipboard,
  Pencil,
  Disc3,
  Radio,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type ApiVoice, listVoices, listPresets, uploadVoice, deleteVoice, patchVoice, getServerSettings } from "@/lib/api";
import AudioVisualizerCanvas, { type AudioVisualizerHandle } from "@/components/AudioVisualizerCanvas";
import TrimWaveform from "@/components/TrimWaveform";
import { tagStyle } from "@/lib/utils";
import { BRAND, BRAND_GRADIENT, BRAND_SECONDARY, BRAND_WARM } from "@/lib/theme";
import {
  DEFAULT_MAX_VOICE_CLIP_DURATION_S,
  buildPeaks,
  clampTrimRange,
  clampTrimRangeToMaxDuration,
  decodeAudioBlob,
  exportTrimmedWavBlob,
  fullTrimRange,
  isFullTrimRange,
  isTrimDurationWithinLimit,
  trimmedDuration,
  trimLimitMessage,
  type TrimRange,
} from "@/lib/audio-trim";

export const Route = createFileRoute("/app/voices")({
  head: () => ({ meta: [{ title: "Voices — Vox Studio" }] }),
  component: VoicesPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugToTitle(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function voiceDisplayLabel(v: ApiVoice): string {
  return v.display_name ?? slugToTitle(v.name);
}

function dataUrlBytes(value: string): number {
  const payload = value.split(",", 2)[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function VoicesPage() {
  const [tab, setTab] = useState<"upload" | "record">("record");
  const [query, setQuery] = useState("");
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: voices = [], isLoading } = useQuery({
    queryKey: ["voices"],
    queryFn: listVoices,
  });
  const { data: serverSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: getServerSettings,
    staleTime: 5 * 60 * 1000,
  });
  const maxVoiceClipDurationSeconds = serverSettings?.max_voice_clip_duration_s ?? DEFAULT_MAX_VOICE_CLIP_DURATION_S;

  const filtered = voices.filter(
    (v) =>
      voiceDisplayLabel(v).toLowerCase().includes(query.toLowerCase()) ||
      v.name.toLowerCase().includes(query.toLowerCase()) ||
      (v.description ?? "").toLowerCase().includes(query.toLowerCase()) ||
      v.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())),
  );
  const selectedVoice = voices.find((voice) => voice.name === selectedVoiceId);

  const handleUse = (voice: ApiVoice) => {
    localStorage.setItem("vox:voiceId", JSON.stringify(voice.name));
    navigate({ to: "/app/" });
  };

  const handleDelete = async (voice: ApiVoice) => {
    await deleteVoice(voice.name);
    queryClient.invalidateQueries({ queryKey: ["voices"] });
    if (activeVoiceId === voice.name) setActiveVoiceId(null);
    if (selectedVoiceId === voice.name) setSelectedVoiceId(null);
  };

  const handleUploaded = () => queryClient.invalidateQueries({ queryKey: ["voices"] });

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-black tracking-tight text-foreground">Voices</h1>
        <div className="inline-flex rounded-xl border border-border bg-white p-1 shadow-sm">
            <button
              onClick={() => setTab("upload")}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all " +
                (tab === "upload"
                  ? "bg-gradient-to-br from-[var(--brand)] to-[var(--brand-secondary)] text-white shadow-[0_2px_8px_color-mix(in_oklch,var(--brand)_35%,transparent)]"
                  : "text-foreground/60 hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]")
              }
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Upload
            </button>
            <button
              onClick={() => setTab("record")}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all " +
                (tab === "record"
                  ? "bg-[var(--brand-soft)] text-[var(--brand)] shadow-[0_2px_8px_color-mix(in_oklch,var(--brand)_18%,transparent)]"
                  : "text-foreground/60 hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]")
              }
            >
              <span className="relative flex h-2 w-2">
                {tab === "record" && <span className="absolute inset-0 animate-ping rounded-full bg-[var(--brand)]/50" />}
                <span className={"relative h-2 w-2 rounded-full " + (tab === "record" ? "bg-[var(--brand)]" : "bg-[var(--brand-secondary)]")} />
              </span>
              Start Recording
            </button>
            <button
              disabled
              title="Coming soon"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-[var(--brand)]/40"
            >
              <Globe className="h-3.5 w-3.5" />
              URL
              <span className="rounded-md bg-[var(--brand-soft)] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--brand)]">
                Soon
              </span>
            </button>
        </div>
      </div>
      {/* Panel */}
      <section className="vox-panel p-6">
        {tab === "upload" ? (
          <UploadPane onUploaded={handleUploaded} maxVoiceClipDurationSeconds={maxVoiceClipDurationSeconds} />
        ) : (
          <RecordPane onSaved={handleUploaded} maxVoiceClipDurationSeconds={maxVoiceClipDurationSeconds} />
        )}
      </section>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voice profiles…"
            className="vox-input w-full py-3 pl-10 pr-4 text-[14px]"
          />
        </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-foreground/40">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="vox-panel-muted flex flex-col items-center justify-center gap-2 border-dashed py-14 text-center">
          <Mic className="h-8 w-8 text-foreground/20" />
          <p className="text-[14px] font-medium text-foreground/40">
            {query ? "No voices match your search" : "No voice profiles yet"}
          </p>
          <p className="text-[12px] text-foreground/30">
            {query ? "Try a different search term" : "Record or upload a sample to get started"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((v) => (
            <ProfileCard
              key={v.id}
              voice={v}
              activeVoiceId={activeVoiceId}
              selected={selectedVoiceId === v.name}
              onActivate={setActiveVoiceId}
              onSelect={() => setSelectedVoiceId(v.name)}
              onUse={() => handleUse(v)}
              onDelete={() => handleDelete(v)}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["voices"] })}
            />
          ))}
        </div>
      )}

      {selectedVoice && (
        <section aria-label="Selected voice" className="vox-panel-muted flex flex-col gap-4 border-[var(--brand)]/25 bg-[linear-gradient(135deg,var(--brand-soft),transparent_55%)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Selected voice</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-foreground">{voiceDisplayLabel(selectedVoice)}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{selectedVoice.description || "Ready to use for your next script."}</p>
            {selectedVoice.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selectedVoice.tags.map((tag) => <span key={tag} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={tagStyle(tag)}>{tag}</span>)}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => handleUse(selectedVoice)} className="rounded-lg bg-[var(--brand)] px-3.5 py-2 text-sm font-bold text-white shadow-sm">Use in Create</button>
            <button type="button" onClick={() => setSelectedVoiceId(null)} className="vox-control px-3 py-2 text-sm font-semibold">Close</button>
          </div>
        </section>
      )}

      {!isLoading && (
        <div className="text-center text-[12px] text-muted-foreground">
          {filtered.length} of {voices.length} voice profile{voices.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// ─── Upload Pane ────────────────────────────────────────────────────────────

type PresetParams = { temperature?: number; exaggeration?: number; cfg_weight?: number; repetition_penalty?: number; top_p?: number; min_p?: number };

function PresetSelect({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { data: presets = {} } = useQuery({ queryKey: ["presets"], queryFn: listPresets, staleTime: 5 * 60 * 1000 });
  const names = Object.keys(presets);
  return (
    <div>
      <label className="text-[13px] font-semibold text-foreground">
        Default tone <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-[oklch(0.55_0.22_260)] capitalize"
      >
        <option value="">— Use model defaults —</option>
        {names.map((name) => (
          <option key={name} value={name} className="capitalize">{name}</option>
        ))}
      </select>
      <p className="mt-1 text-[11.5px] text-muted-foreground">Applied whenever this voice is used for generation</p>
    </div>
  );
}

function UploadPane({
  onUploaded,
  maxVoiceClipDurationSeconds,
}: {
  onUploaded: () => void;
  maxVoiceClipDurationSeconds: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const uploadCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDuration, setUploadDuration] = useState(0);
  const [uploadHover, setUploadHover] = useState<number | null>(null);
  const [uploadVolume, setUploadVolume] = useState(0.8);
  const [uploadPeaks, setUploadPeaks] = useState<number[] | null>(null);
  const [trimRange, setTrimRange] = useState<TrimRange>({ start: 0, end: 0 });
  const { data: presets = {} } = useQuery({ queryKey: ["presets"], queryFn: listPresets, staleTime: 5 * 60 * 1000 });

  const pickFile = async (f: File) => {
    setFile(f);
    setStatus("idle");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setPlaying(false);
    setUploadProgress(0);
    setUploadDuration(0);
    setUploadPeaks(null);
    setTrimRange({ start: 0, end: 0 });
    if (!voiceName) setVoiceName(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").slice(0, 40));
    try {
      const decoded = await decodeAudioBlob(f);
      setUploadDuration(decoded.duration);
      setTrimRange(fullTrimRange(decoded.duration));
      setUploadPeaks(buildPeaks(decoded));
    } catch {
      setUploadPeaks([]);
    }
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = uploadVolume;
  }, [uploadVolume]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !previewUrl) return;
    const onTime = () => setUploadProgress(a.currentTime);
    const onDur = () => { if (isFinite(a.duration)) setUploadDuration(a.duration); };
    const onEnded = () => { setPlaying(false); setUploadProgress(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("durationchange", onDur);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("durationchange", onDur);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("ended", onEnded);
    };
  }, [previewUrl]);

  // Canvas draw loop for upload mini player
  useEffect(() => {
    if (!previewUrl) return;
    let raf = 0;
    const draw = () => {
      const canvas = uploadCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && uploadPeaks) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const barW = 2;
        const gap = 2;
        const slot = barW + gap;
        const count = Math.floor(w / slot);
        const playedX = uploadDuration > 0 ? (uploadProgress / uploadDuration) * w : 0;
        const hoverX = uploadHover != null ? uploadHover * w : null;
        const trimStartX = uploadDuration > 0 ? (trimRange.start / uploadDuration) * w : 0;
        const trimEndX = uploadDuration > 0 ? (trimRange.end / uploadDuration) * w : w;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, BRAND);
        grad.addColorStop(0.55, BRAND_SECONDARY);
        grad.addColorStop(1, BRAND_WARM);
        ctx.fillStyle = "oklch(0.98 0.01 260)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "oklch(0.55 0.04 240 / 0.08)";
        ctx.fillRect(0, 0, trimStartX, h);
        ctx.fillRect(trimEndX, 0, Math.max(0, w - trimEndX), h);
        for (let i = 0; i < count; i++) {
          const p = uploadPeaks[Math.floor((i / count) * uploadPeaks.length)] ?? 0;
          const bh = Math.max(2, p * (h * 0.85));
          const x = i * slot;
          const y = (h - bh) / 2;
          const isPlayed = x < playedX;
          const inTrim = x >= trimStartX && x <= trimEndX;
          const inHover = hoverX != null && x >= playedX && x < hoverX;
          ctx.fillStyle = inTrim ? (isPlayed ? grad : inHover ? BRAND : "oklch(0.55 0.04 240 / 0.3)") : "oklch(0.55 0.04 240 / 0.14)";
          ctx.beginPath();
          ctx.moveTo(x + 1, y);
          ctx.arcTo(x + barW, y, x + barW, y + bh, 1);
          ctx.arcTo(x + barW, y + bh, x, y + bh, 1);
          ctx.arcTo(x, y + bh, x, y, 1);
          ctx.arcTo(x, y, x + barW, y, 1);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = BRAND_WARM;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playedX, 3);
        ctx.lineTo(playedX, h - 3);
        ctx.stroke();
        ctx.fillStyle = BRAND_WARM;
        ctx.beginPath();
        ctx.arc(playedX, h / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [previewUrl, uploadPeaks, uploadProgress, uploadDuration, uploadHover, trimRange.end, trimRange.start]);

  const handleCreate = async () => {
    if (!file || !voiceName.trim()) return;
    setStatus("uploading");
    setErrorMsg("");
    try {
      const fd = new FormData();
      let uploadFile: File = file;
      const uploadTrimRange = clampTrimRangeToMaxDuration(trimRange, maxVoiceClipDurationSeconds);
      if (!isFullTrimRange(uploadTrimRange, uploadDuration)) {
        const trimmed = await exportTrimmedWavBlob(file, uploadTrimRange);
        const base = file.name.replace(/\.[^.]+$/, "");
        uploadFile = new File([trimmed], `${base}-trimmed.wav`, { type: "audio/wav" });
      }
      fd.append("file", uploadFile);
      fd.append("name", voiceName.trim());
      if (tags.trim()) fd.append("tags", tags.trim());
      if (description.trim()) fd.append("description", description.trim());
      const presetParams = selectedPreset ? (presets[selectedPreset] as PresetParams | undefined) : undefined;
      if (presetParams) {
        if (presetParams.temperature != null) fd.append("temperature", String(presetParams.temperature));
        if (presetParams.exaggeration != null) fd.append("exaggeration", String(presetParams.exaggeration));
        if (presetParams.cfg_weight != null) fd.append("cfg_weight", String(presetParams.cfg_weight));
        if (presetParams.repetition_penalty != null) fd.append("repetition_penalty", String(presetParams.repetition_penalty));
        if (presetParams.top_p != null) fd.append("top_p", String(presetParams.top_p));
        if (presetParams.min_p != null) fd.append("min_p", String(presetParams.min_p));
      }
      await uploadVoice(fd);
      setStatus("done");
      onUploaded();
      setTimeout(() => {
        setFile(null); setVoiceName(""); setTags(""); setDescription(""); setSelectedPreset("");
        setPreviewUrl(null); setPlaying(false); setStatus("idle");
        setUploadProgress(0); setUploadDuration(0); setUploadPeaks(null); setTrimRange({ start: 0, end: 0 });
        if (fileRef.current) fileRef.current.value = "";
      }, 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  };

  const selectedDuration = trimmedDuration(trimRange);
  const trimError = trimLimitMessage(selectedDuration, maxVoiceClipDurationSeconds);
  const canCreate =
    !!file &&
    !!voiceName.trim() &&
    status !== "uploading" &&
    status !== "done" &&
    selectedDuration > 0 &&
    isTrimDurationWithinLimit(selectedDuration, maxVoiceClipDurationSeconds) &&
    (uploadDuration <= maxVoiceClipDurationSeconds || !isFullTrimRange(trimRange, uploadDuration));

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-3">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void pickFile(f); }}
          className={"flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors " + (dragOver ? "border-[var(--brand)] bg-[var(--brand-soft)]" : file ? "border-[var(--brand-secondary)] bg-[color-mix(in oklch, var(--brand-soft) 55%, white)]" : "border-border bg-[oklch(0.985_0.005_260)] hover:bg-muted/40")}
        >
          <input ref={fileRef} type="file" accept=".wav,.m4a,.mp3,.aiff,.flac,.ogg,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); }} />
          {file ? (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-soft)]"><Check className="h-5 w-5 text-[var(--brand)]" /></span>
              <div className="mt-3 text-[15px] font-semibold text-foreground">{file.name}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</div>
            </>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-soft)]"><UploadCloud className="h-5 w-5 text-[var(--brand)]" /></span>
              <div className="mt-4 text-[15px] font-semibold text-foreground">Upload voice sample</div>
              <div className="mt-1 text-[13px] text-muted-foreground">Drag and drop, or click to browse</div>
              <div className="mt-3 text-[12px] tracking-wide text-muted-foreground/70">WAV · M4A · MP3 · AIFF · FLAC · OGG</div>
            </>
          )}
        </label>
        {previewUrl && (
          <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[var(--card)] to-[var(--background)] px-3 py-2.5">
            <audio ref={audioRef} src={previewUrl} preload="auto" />
            {/* Gradient play button */}
            <button
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play preview"}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
              style={{
                background: BRAND_GRADIENT,
                boxShadow: "var(--shadow-btn)",
              }}
            >
              {playing && <span className="absolute inset-0 -m-0.5 animate-ping rounded-full border-2 border-[var(--brand)]/30" />}
              {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
            </button>
            {/* Time */}
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/55">
              {(() => { const t = Math.max(0, Math.floor(uploadProgress)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`; })()}
            </span>
            {/* Waveform canvas */}
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ background: "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.5), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.45), transparent 60%)" }}
              />
              <canvas
                ref={uploadCanvasRef}
                onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setUploadHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); }}
                onMouseLeave={() => setUploadHover(null)}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                  const a = audioRef.current;
                  if (a && uploadDuration > 0) { a.currentTime = pct * uploadDuration; setUploadProgress(pct * uploadDuration); }
                }}
                className="relative block h-9 w-full cursor-pointer"
              />
            </div>
            {/* Duration */}
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/40">
              {(() => { const t = Math.max(0, Math.floor(uploadDuration)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`; })()}
            </span>
            {/* Volume pill */}
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-1.5 py-1">
              <button onClick={() => setUploadVolume((v) => v === 0 ? 0.8 : 0)} className="text-foreground/60 hover:text-foreground" aria-label={uploadVolume === 0 ? "Unmute" : "Mute"}>
                {uploadVolume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <div className="relative hidden h-1 w-14 rounded-full bg-muted sm:block">
                <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${uploadVolume * 100}%`, background: "linear-gradient(90deg, var(--brand), var(--brand-warm))" }} />
                <input type="range" min={0} max={1} step={0.01} value={uploadVolume} onChange={(e) => setUploadVolume(Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0" aria-label="Volume" />
              </div>
            </div>
            {/* Remove */}
            <button
              onClick={() => { setFile(null); setPreviewUrl(null); setPlaying(false); setVoiceName(""); setUploadProgress(0); setUploadDuration(0); setUploadPeaks(null); setTrimRange({ start: 0, end: 0 }); if (fileRef.current) fileRef.current.value = ""; }}
              className="shrink-0 text-foreground/40 hover:text-foreground"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {previewUrl && uploadDuration > 0 && (
          <TrimWaveform
            className="mt-1"
            peaks={uploadPeaks ?? []}
            duration={uploadDuration}
            selection={trimRange}
            onChange={setTrimRange}
            maxDurationSeconds={maxVoiceClipDurationSeconds}
            playheadSeconds={uploadProgress}
          />
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[13px] font-semibold text-foreground">Voice name <span className="text-[var(--brand-warm)]">*</span></label>
          <input value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="e.g. My Narrator" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[var(--brand)]" />
        </div>
        <div>
          <label className="text-[13px] font-semibold text-foreground">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Calm narrator for long-form content" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[var(--brand)]" />
        </div>
        <div>
          <label className="text-[13px] font-semibold text-foreground">Tags <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="narration, calm, male" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[var(--brand)]" />
          <div className="mt-1 text-[11.5px] text-muted-foreground">Comma-separated</div>
        </div>
        <PresetSelect value={selectedPreset} onChange={setSelectedPreset} />
        {status === "error" && (
          <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in oklch, var(--brand-warm) 20%, white)] bg-[color-mix(in oklch, var(--brand-warm) 8%, white)] px-3 py-2 text-[12.5px] text-[var(--brand-warm)]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{errorMsg}
          </div>
        )}
        {trimError && (
          <p className="rounded-lg border border-[oklch(0.82_0.08_40)] bg-[oklch(0.98_0.02_40)] px-3 py-2 text-[12px] font-medium text-[oklch(0.48_0.13_40)]">
            {trimError}
          </p>
        )}
        <button onClick={handleCreate} disabled={!canCreate} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}>
          {status === "uploading" ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : status === "done" ? <><Check className="h-4 w-4" /> Profile created!</> : "Create Voice Profile"}
        </button>
      </div>
    </div>
  );
}

// ─── Record Pane ────────────────────────────────────────────────────────────

function RecordPane({
  onSaved,
  maxVoiceClipDurationSeconds,
}: {
  onSaved: () => void;
  maxVoiceClipDurationSeconds: number;
}) {
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "no-device" | "insecure-context">("unknown");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [tags, setTags] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const { data: presets = {} } = useQuery({ queryKey: ["presets"], queryFn: listPresets, staleTime: 5 * 60 * 1000 });
  const [peaks, setPeaks]               = useState<number[] | null>(null);
  const [playProgress, setPlayProgress]   = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [trimRange, setTrimRange] = useState<TrimRange>({ start: 0, end: 0 });
  const [level, setLevel]               = useState(0);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const audioRef         = useRef<HTMLAudioElement>(null);
  const canvasRef        = useRef<HTMLCanvasElement | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const vizAudioCtxRef   = useRef<AudioContext | null>(null);
  const liveDataRef      = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const liveHistoryRef   = useRef<number[]>([]);
  const rafRef           = useRef<number | null>(null);
  const MAX = maxVoiceClipDurationSeconds;

  const micUnavailableReason = () => {
    if (!window.isSecureContext) return "insecure-context";
    if (!navigator.mediaDevices?.getUserMedia) return "insecure-context";
    return null;
  };

  const runMicPreflight = async () => {
    const unavailable = micUnavailableReason();
    if (unavailable) {
      setPermission(unavailable);
      return;
    }
    try {
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (perm.state === "denied") {
          setPermission("denied");
          return;
        }
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === "audioinput");
      setDevices(mics);
      if (mics.length === 0) {
        setPermission("no-device");
        return;
      }
      if (!selectedDeviceId || !mics.some((d) => d.deviceId === selectedDeviceId)) {
        setSelectedDeviceId(mics[0].deviceId);
      }
    } catch {
      setPermission("no-device");
    }
  };

  useEffect(() => {
    void runMicPreflight();
  }, []);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const id = window.setInterval(() => { setElapsed((e) => { if (e + 1 >= MAX) { stopRecording(); return MAX; } return e + 1; }); }, 1000);
    return () => window.clearInterval(id);
  }, [MAX, recordingState]);

  // Playback controls
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.play().catch(() => setPlaying(false)); }
    else          { a.pause(); }
  }, [playing]);

  // Playback progress + duration
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime    = () => { if (a.duration > 0) setPlayProgress(a.currentTime / a.duration); };
    const onEnded   = () => { setPlaying(false); setPlayProgress(0); };
    const onLoaded  = () => { if (isFinite(a.duration)) setAudioDuration(a.duration); };
    a.addEventListener("timeupdate",     onTime);
    a.addEventListener("ended",          onEnded);
    a.addEventListener("loadedmetadata", onLoaded);
    return () => {
      a.removeEventListener("timeupdate",     onTime);
      a.removeEventListener("ended",          onEnded);
      a.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [recordedUrl]);

  // ── Canvas RAF draw loop ────────────────────────────────────────────────────
  useEffect(() => {
    function brandGradient(ctx: CanvasRenderingContext2D, w: number) {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, BRAND);
      g.addColorStop(0.55, BRAND_SECONDARY);
      g.addColorStop(1, BRAND_WARM);
      return g;
    }
    function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + bw, y,      x + bw, y + bh, r);
      ctx.arcTo(x + bw, y + bh, x,      y + bh, r);
      ctx.arcTo(x,      y + bh, x,      y,       r);
      ctx.arcTo(x,      y,      x + bw, y,       r);
      ctx.closePath();
    }

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // centre line
      ctx.strokeStyle = "oklch(0.55 0.03 260 / 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

      const barW = 2, gap = 2, slot = barW + gap;

      if (recordingState !== "done") {
        // Live: sample analyser each frame, push to history
        const analyser = analyserRef.current;
        if (analyser && recordingState === "recording") {
          const buf = liveDataRef.current!;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          const rms = Math.sqrt(sum / buf.length);
          setLevel(Math.min(1, rms * 2.5));
          const maxBars = Math.floor(w / slot);
          liveHistoryRef.current.push(rms);
          if (liveHistoryRef.current.length > maxBars) liveHistoryRef.current.splice(0, liveHistoryRef.current.length - maxBars);
        }
        const hist = liveHistoryRef.current;
        const count = Math.floor(w / slot);
        const startIdx = Math.max(0, hist.length - count);
        ctx.fillStyle = brandGradient(ctx, w);
        for (let i = 0; i < count; i++) {
          const v = hist[startIdx + i] ?? 0;
          const amp = Math.min(1, v * 3.2);
          const bh = Math.max(2, amp * h * 0.9);
          roundedRect(ctx, i * slot, (h - bh) / 2, barW, bh, 1);
          ctx.fill();
        }
        // glow at leading edge
        if (recordingState === "recording" && hist.length > 0) {
          const lastX = Math.min(count, hist.length) * slot;
          const grad = ctx.createRadialGradient(lastX, h / 2, 0, lastX, h / 2, 40);
          grad.addColorStop(0, "oklch(0.62 0.22 25 / 0.35)");
          grad.addColorStop(1, "oklch(0.62 0.22 25 / 0)");
          ctx.fillStyle = grad; ctx.fillRect(lastX - 40, 0, 80, h);
        }
      } else {
        // Static: decoded peaks + playhead
        const p = peaks;
        if (!p || p.length === 0) {
          rafRef.current = requestAnimationFrame(draw); return;
        }
        const count   = Math.floor(w / slot);
        const playedX = playProgress * w;
        for (let i = 0; i < count; i++) {
          const amp = p[Math.floor((i / count) * p.length)] ?? 0;
          const bh  = Math.max(2, amp * h * 0.9);
          const x   = i * slot;
          ctx.fillStyle = x < playedX ? brandGradient(ctx, w) : "oklch(0.75 0.04 260 / 0.35)";
          roundedRect(ctx, x, (h - bh) / 2, barW, bh, 1);
          ctx.fill();
        }
        // playhead
        ctx.strokeStyle = BRAND_WARM;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(playedX, 4); ctx.lineTo(playedX, h - 4); ctx.stroke();
        ctx.fillStyle = BRAND_WARM;
        ctx.beginPath(); ctx.arc(playedX, h / 2, 4, 0, Math.PI * 2); ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [recordingState, peaks, playProgress]);

  const classifyMicError = (err: unknown) => {
    const unavailable = micUnavailableReason();
    if (unavailable) {
      setPermission(unavailable);
      return;
    }
    const name = err instanceof Error ? err.name : "";
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotReadableError" || name === "OverconstrainedError") {
      setPermission("no-device");
    } else {
      setPermission("denied");
    }
  };

  const refreshDevices = async () => {
    if (micUnavailableReason()) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    const mics = all.filter((d) => d.kind === "audioinput");
    setDevices(mics);
    if (mics.length > 0 && !mics.find((d) => d.deviceId === selectedDeviceId)) setSelectedDeviceId(mics[0].deviceId);
  };

  const getAudioConstraints = () => selectedDeviceId ? { audio: { deviceId: { exact: selectedDeviceId } } } : { audio: true };

  const requestMic = async () => {
    const unavailable = micUnavailableReason();
    if (unavailable) { setPermission(unavailable); return; }
    try { const stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints()); streamRef.current = stream; setPermission("granted"); await refreshDevices(); }
    catch (err) { classifyMicError(err); }
  };

  const switchDevice = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (permission !== "granted" || recordingState === "recording") return;
    if (micUnavailableReason()) { setPermission("insecure-context"); return; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } }); streamRef.current = stream; }
    catch (err) { classifyMicError(err); }
  };

  const computePeaks = async (blob: Blob) => {
    try {
      const decoded = await decodeAudioBlob(blob);
      setAudioDuration(decoded.duration);
      setTrimRange(fullTrimRange(decoded.duration));
      const ch     = decoded.getChannelData(0);
      const target = 800;
      const block  = Math.max(1, Math.floor(ch.length / target));
      let maxVal   = 0;
      const raw: number[] = [];
      for (let i = 0; i < target; i++) {
        let sum = 0;
        const s = i * block, e2 = Math.min(ch.length, s + block);
        for (let j = s; j < e2; j++) sum += ch[j] * ch[j];
        const rms = Math.sqrt(sum / (e2 - s));
        raw.push(rms);
        if (rms > maxVal) maxVal = rms;
      }
      setPeaks(raw.map((v) => (maxVal > 0 ? v / maxVal : 0)));
    } catch { setPeaks([]); }
  };

  const startRecording = async () => {
    let stream = streamRef.current;
    if (!stream) {
      const unavailable = micUnavailableReason();
      if (unavailable) { setPermission(unavailable); return; }
      try { stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints()); streamRef.current = stream; setPermission("granted"); await refreshDevices(); }
      catch (err) { classifyMicError(err); return; }
    }
    chunksRef.current = [];
    liveHistoryRef.current = [];
    setPlayProgress(0);
    setPeaks(null);
    setTrimRange({ start: 0, end: 0 });

    // Wire up AnalyserNode for live waveform
    const ac = new AudioContext();
    vizAudioCtxRef.current = ac;
    const source  = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyserRef.current  = analyser;
    liveDataRef.current  = new Uint8Array(analyser.fftSize);

    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      setRecordedBlob(blob);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(URL.createObjectURL(blob));
      computePeaks(blob);
    };
    mediaRecorderRef.current = mr;
    mr.start(250);
    setRecordingState("recording");
    setElapsed(0);
    setSaveStatus("idle");
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    vizAudioCtxRef.current?.close(); vizAudioCtxRef.current = null;
    analyserRef.current = null;
    setLevel(0);
    setRecordingState("done");
    setPlaying(false);
  };

  const discard = () => {
    mediaRecorderRef.current?.stop();
    vizAudioCtxRef.current?.close(); vizAudioCtxRef.current = null;
    analyserRef.current = null;
    liveHistoryRef.current = [];
    setRecordingState("idle");
    setElapsed(0);
    setLevel(0);
    setRecordedBlob(null);
    setPeaks(null);
    setPlayProgress(0);
    setAudioDuration(0);
    setTrimRange({ start: 0, end: 0 });
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    setPlaying(false);
    setShowSaveForm(false);
    setConfirmDiscard(false);
    setSaveStatus("idle");
  };

  const handleSave = async () => {
    if (!recordedBlob || !voiceName.trim()) return;
    setSaveStatus("saving"); setSaveError("");
    try {
      let file: File;
      const recordingTrimRange = clampTrimRangeToMaxDuration(trimRange, maxVoiceClipDurationSeconds);
      if (!isFullTrimRange(recordingTrimRange, audioDuration)) {
        const trimmed = await exportTrimmedWavBlob(recordedBlob, recordingTrimRange);
        file = new File([trimmed], "recording-trimmed.wav", { type: "audio/wav" });
      } else {
        const ext = recordedBlob.type.includes("ogg") ? "ogg" : recordedBlob.type.includes("mp4") ? "m4a" : "webm";
        file = new File([recordedBlob], `recording.${ext}`, { type: recordedBlob.type });
      }
      const fd = new FormData(); fd.append("file", file); fd.append("name", voiceName.trim());
      if (tags.trim()) fd.append("tags", tags.trim());
      const presetParams = selectedPreset ? (presets[selectedPreset] as PresetParams | undefined) : undefined;
      if (presetParams) {
        if (presetParams.temperature != null) fd.append("temperature", String(presetParams.temperature));
        if (presetParams.exaggeration != null) fd.append("exaggeration", String(presetParams.exaggeration));
        if (presetParams.cfg_weight != null) fd.append("cfg_weight", String(presetParams.cfg_weight));
        if (presetParams.repetition_penalty != null) fd.append("repetition_penalty", String(presetParams.repetition_penalty));
        if (presetParams.top_p != null) fd.append("top_p", String(presetParams.top_p));
        if (presetParams.min_p != null) fd.append("min_p", String(presetParams.min_p));
      }
      await uploadVoice(fd); setSaveStatus("done"); onSaved();
      setTimeout(() => { discard(); setVoiceName(""); setTags(""); setSelectedPreset(""); setSaveStatus("idle"); }, 2000);
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Save failed"); setSaveStatus("error"); }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const selectedDuration = trimmedDuration(trimRange);
  const trimError = trimLimitMessage(selectedDuration, maxVoiceClipDurationSeconds);
  const canSave = !!recordedBlob && !!voiceName.trim() && saveStatus !== "saving" && selectedDuration > 0 && isTrimDurationWithinLimit(selectedDuration, maxVoiceClipDurationSeconds);

  if (permission === "no-device") return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[oklch(0.82_0.08_40)] bg-[oklch(0.985_0.01_40)] py-12 text-center">
      <Mic className="h-8 w-8 text-[oklch(0.6_0.14_40)]" />
      <p className="text-[14px] font-semibold text-foreground">No microphone detected</p>
      <p className="max-w-xs text-[12.5px] text-muted-foreground">Connect a microphone and try again, or use the <strong>Upload</strong> tab to add an existing audio file.</p>
      <button onClick={() => { void runMicPreflight(); }} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-medium text-foreground/80 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" />Try again</button>
    </div>
  );

  if (permission === "denied") return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[oklch(0.82_0.08_25)] bg-[oklch(0.985_0.01_25)] py-12 text-center">
      <AlertCircle className="h-8 w-8 text-[oklch(0.6_0.18_25)]" />
      <p className="text-[14px] font-semibold text-foreground">Microphone access denied</p>
      <p className="max-w-xs text-[12.5px] text-muted-foreground">Open your browser's site settings, allow microphone access for this page in <strong>System Settings → Privacy &amp; Security → Microphone</strong>, then reload.</p>
      <button onClick={() => { void runMicPreflight(); }} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-medium text-foreground/80 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" />Try again</button>
    </div>
  );

  if (permission === "insecure-context") return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[oklch(0.82_0.08_55)] bg-[oklch(0.985_0.01_55)] py-12 text-center">
      <AlertCircle className="h-8 w-8 text-[oklch(0.62_0.16_55)]" />
      <p className="text-[14px] font-semibold text-foreground">Microphone not available over HTTP</p>
      <p className="max-w-xs text-[12.5px] text-muted-foreground">
        Browsers block microphone access on insecure connections. Access Vox over <strong>https://</strong> or from <strong>localhost</strong> to use the recorder.
      </p>
    </div>
  );

  const mode = recordingState === "done" ? "play" : "record";

  const switchMode = (next: "record" | "play") => {
    if (next === mode) return;
    if (next === "record") {
      // switching back to record = discard; ask for confirmation if blob exists
      if (recordedBlob) { setConfirmDiscard(true); return; }
      discard();
    }
    // switching to play is only enabled when recordingState === "done" (pill disabled otherwise)
  };

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-[var(--card)] to-[var(--background)] p-6 shadow-sm">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-bold text-foreground">
            {mode === "record" ? "Record voice sample" : "Review recording"}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {mode === "record" ? "Capture a sample with live waveform." : "Scrub, play, and review your take."}
          </p>
        </div>
        <RecordModeSwitch mode={mode} hasRecording={!!recordedBlob} onChange={switchMode} />
      </div>

      {/* ── Status row ─────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {mode === "record" ? (
          <>
            <RecordStatusPill tone={permission === "granted" ? "ok" : "muted"} dot>
              <Mic className="h-3 w-3" />
              {permission === "granted" ? "Microphone live" : "Mic idle"}
            </RecordStatusPill>
            {recordingState === "recording" && (
              <RecordStatusPill tone="rec" pulse>
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                REC {fmt(elapsed)} / {fmt(MAX)}
              </RecordStatusPill>
            )}
            <RecordLevelMeter level={recordingState === "recording" ? level : 0} />
            {/* multi-mic selector */}
            {permission === "granted" && devices.length > 1 && (
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1">
                <Mic className="h-3 w-3 shrink-0 text-muted-foreground" />
                <select value={selectedDeviceId} onChange={(e) => switchDevice(e.target.value)} disabled={recordingState === "recording"} className="bg-transparent text-[11.5px] font-medium text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60">
                  {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${devices.indexOf(d) + 1}`}</option>)}
                </select>
              </div>
            )}
          </>
        ) : (
          <>
            <RecordStatusPill tone="ok" dot><Disc3 className="h-3 w-3" /> Take ready</RecordStatusPill>
            <RecordStatusPill tone="muted">
              <Radio className="h-3 w-3" />
              {fmt(Math.floor(playProgress * audioDuration))} / {fmt(Math.floor(audioDuration))}
            </RecordStatusPill>
          </>
        )}
      </div>

      {/* ── Waveform canvas ────────────────────────────────────── */}
      <div className="relative mt-5 overflow-hidden rounded-xl border border-border bg-muted">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.55), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.5), transparent 60%)" }}
        />
        <canvas
          ref={canvasRef}
          style={{ height: 160, display: "block", width: "100%" }}
          className={"relative " + (mode === "play" && recordedUrl ? "cursor-pointer" : "")}
          onClick={(e) => {
            if (mode !== "play" || !audioRef.current || !audioDuration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audioRef.current.currentTime = ratio * audioDuration;
            setPlayProgress(ratio);
          }}
        />
      </div>

      {mode === "play" && recordedBlob && audioDuration > 0 && (
        <TrimWaveform
          className="mt-4"
          peaks={peaks ?? []}
          duration={audioDuration}
          selection={trimRange}
          onChange={setTrimRange}
          maxDurationSeconds={maxVoiceClipDurationSeconds}
          playheadSeconds={playProgress * audioDuration}
        />
      )}

      {/* ── Controls ───────────────────────────────────────────── */}
      <div className="mt-5">
        {mode === "record" ? (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={permission !== "granted" ? requestMic : recordingState === "recording" ? stopRecording : startRecording}
              aria-label={recordingState === "recording" ? "Stop recording" : "Start recording"}
              className="group relative flex h-16 items-center gap-3 rounded-full pl-4 pr-6 text-[14px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: recordingState === "recording"
                  ? "linear-gradient(135deg, var(--brand-warm), oklch(0.5 0.22 15))"
                  : "linear-gradient(135deg, var(--brand), var(--brand-secondary), oklch(0.6 0.22 25))",
                boxShadow: "0 16px 36px -14px oklch(0.55 0.22 280 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
              }}
            >
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                {recordingState === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />}
                {recordingState === "recording"
                  ? <Square className="h-4 w-4" fill="currentColor" />
                  : permission !== "granted"
                    ? <Mic className="h-4 w-4" />
                    : <span className="h-3.5 w-3.5 rounded-full bg-white" />}
              </span>
              <span className="tracking-wide">
                {permission !== "granted" ? "Allow Microphone" : recordingState === "recording" ? "Stop Recording" : "Begin Capture"}
              </span>
              {recordingState === "recording" && (
                <span className="ml-2 rounded-md bg-white/15 px-2 py-0.5 text-[11px] tabular-nums backdrop-blur">{fmt(elapsed)}</span>
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* Play / Pause */}
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={!recordedUrl}
              className="flex h-14 items-center gap-3 rounded-full pl-3 pr-5 text-[14px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-secondary))", boxShadow: "var(--shadow-btn)" }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
              </span>
              {playing ? "Pause" : "Play"}
            </button>

            {/* Save as Profile */}
            <button
              onClick={() => setShowSaveForm((v) => !v)}
              disabled={!recordedBlob}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-[13px] font-semibold text-foreground/80 hover:bg-muted disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5 text-[oklch(0.55_0.22_260)]" /> Save as Profile
            </button>

            {/* Discard */}
            {confirmDiscard ? (
              <div className="flex items-center gap-2 rounded-full border border-[oklch(0.82_0.08_25)] bg-[var(--brand-soft)] px-4 py-2">
                <span className="text-[12.5px] font-medium text-[oklch(0.52_0.18_25)]">Delete recording?</span>
                <button onClick={discard} className="rounded-full bg-[oklch(0.6_0.22_25)] px-3 py-1 text-[12px] font-bold text-white hover:brightness-110">Yes, delete</button>
                <button onClick={() => setConfirmDiscard(false)} className="text-[12px] font-medium text-foreground/60 hover:text-foreground">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDiscard(true)}
                disabled={!recordedBlob}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-[13px] font-semibold text-[oklch(0.6_0.22_25)] hover:bg-muted disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Discard
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Save form (shown when Save as Profile is clicked) ─── */}
      {showSaveForm && mode === "play" && (
        <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-border bg-white/60 p-4 backdrop-blur sm:grid-cols-2">
          <div>
            <label className="text-[13px] font-semibold text-foreground">Voice name <span className="text-[oklch(0.55_0.22_25)]">*</span></label>
            <input value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="e.g. My Narrator" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]" />
          </div>
          <div>
            <label className="text-[13px] font-semibold text-foreground">Tags <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="narration, calm, male" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]" />
          </div>
          <div className="col-span-full">
            <PresetSelect value={selectedPreset} onChange={setSelectedPreset} />
          </div>
          {saveStatus === "error" && (
            <div className="col-span-full flex items-center gap-2 rounded-lg border border-[oklch(0.82_0.08_25)] bg-[var(--brand-soft)] px-3 py-2 text-[12.5px] text-[oklch(0.52_0.18_25)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{saveError}
            </div>
          )}
          {trimError && (
            <div className="col-span-full rounded-lg border border-[oklch(0.82_0.08_40)] bg-[oklch(0.98_0.02_40)] px-3 py-2 text-[12px] font-medium text-[oklch(0.48_0.13_40)]">
              {trimError}
            </div>
          )}
          <div className="col-span-full flex justify-end gap-2">
            <button onClick={() => setShowSaveForm(false)} className="rounded-xl border border-border bg-white px-4 py-2 text-[13px] font-semibold text-foreground/60 hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={!canSave || saveStatus === "done"} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-secondary))", boxShadow: "var(--shadow-btn)" }}>
              {saveStatus === "saving" ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : saveStatus === "done" ? <><Check className="h-4 w-4" /> Saved!</> : "Save Voice Profile"}
            </button>
          </div>
        </div>
      )}

      {recordedUrl && <audio ref={audioRef} src={recordedUrl} preload="auto" className="hidden" />}
    </div>
  );
}

// ─── RecordPane helper components ────────────────────────────────────────────

function RecordModeSwitch({ mode, hasRecording, onChange }: { mode: "record" | "play"; hasRecording: boolean; onChange: (m: "record" | "play") => void }) {
  return (
    <div className="relative flex items-center rounded-full border border-border bg-white p-1 shadow-sm" role="tablist">
      <span
        aria-hidden
        className="absolute top-1 bottom-1 w-[100px] rounded-full transition-all duration-300 ease-out"
        style={{
          left: mode === "record" ? 4 : 104,
          background: mode === "record"
            ? "linear-gradient(135deg, var(--brand-warm), oklch(0.5 0.22 15))"
            : "linear-gradient(135deg, var(--brand), var(--brand-secondary))",
          boxShadow: "0 6px 16px -8px oklch(0.5 0.2 280 / 0.6)",
        }}
      />
      <button role="tab" aria-selected={mode === "record"} onClick={() => onChange("record")}
        className={"relative z-10 inline-flex h-9 w-[100px] items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-colors " + (mode === "record" ? "text-white" : "text-foreground/60 hover:text-foreground")}>
        <Mic className="h-3.5 w-3.5" /> Record
      </button>
      <button role="tab" aria-selected={mode === "play"} onClick={() => onChange("play")} disabled={!hasRecording}
        className={"relative z-10 inline-flex h-9 w-[100px] items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed " + (mode === "play" ? "text-white" : "text-foreground/60 hover:text-foreground disabled:text-foreground/30")}>
        <Play className="h-3.5 w-3.5" fill="currentColor" /> Play
      </button>
    </div>
  );
}

function RecordStatusPill({ children, tone = "muted", dot, pulse }: { children: React.ReactNode; tone?: "ok" | "rec" | "muted"; dot?: boolean; pulse?: boolean }) {
  const styles = tone === "ok"
    ? "bg-[oklch(0.96_0.05_150)] text-[oklch(0.42_0.16_150)] border-[oklch(0.88_0.06_150)]"
    : tone === "rec"
      ? "text-white border-transparent"
      : "bg-muted text-foreground/70 border-border";
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold " + styles + (pulse ? " animate-pulse" : "")}
      style={tone === "rec" ? { background: "linear-gradient(135deg, var(--brand-warm), oklch(0.5 0.22 15))" } : undefined}>
      {dot && tone === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.55_0.2_150)]" />}
      {children}
    </span>
  );
}

function RecordLevelMeter({ level }: { level: number }) {
  const segs = 16;
  const active = Math.round(level * segs);
  return (
    <div className="flex items-center gap-[3px] rounded-full border border-border bg-white px-2.5 py-1.5">
      {Array.from({ length: segs }).map((_, i) => {
        const hue = 260 - (i / segs) * 235;
        return (
          <span key={i} className="block h-3 w-[3px] rounded-full transition-opacity"
            style={{ opacity: i < active ? 1 : 0.15, background: `oklch(0.6 0.22 ${hue < 25 ? 25 : hue})` }} />
        );
      })}
    </div>
  );
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

// Deterministic accent color from voice name
function nameToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return h % 360;
}

function AvatarPlayButton({
  name, iconUrl, audioStatus, playing, displayLabel, onClick,
}: {
  name: string;
  iconUrl: string | null;
  audioStatus: "idle" | "loading" | "ready";
  playing: boolean;
  displayLabel: string;
  onClick: () => void;
}) {
  const hue = nameToHue(name);
  const initial = (displayLabel[0] ?? name[0] ?? "?").toUpperCase();

  const bgStyle = iconUrl
    ? undefined
    : { background: `hsl(${hue} 55% 48%)` };

  return (
    <button
      onClick={onClick}
      aria-label={playing ? `Pause ${displayLabel}` : `Play ${displayLabel}`}
      className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-full"
      style={bgStyle}
    >
      {/* Avatar layer */}
      {iconUrl ? (
        <img src={iconUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[17px] font-black text-white/90">
          {initial}
        </span>
      )}

      {/* Play/pause overlay — always visible, darkens on hover/active */}
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/25 transition-colors group-hover:bg-black/40 group-active:bg-black/55">
        {audioStatus === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        ) : playing ? (
          <Pause className="h-4 w-4 text-white" fill="white" />
        ) : (
          <Play className="ml-0.5 h-4 w-4 text-white" fill="white" />
        )}
      </span>
    </button>
  );
}

function ProfileCard({
  voice, activeVoiceId, selected, onActivate, onSelect, onUse, onDelete, onSaved,
}: {
  voice: ApiVoice;
  activeVoiceId: string | null;
  selected: boolean;
  onActivate: (id: string | null) => void;
  onSelect: () => void;
  onUse: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const [audioStatus, setAudioStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[] | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [hover, setHover] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const displayLabel = voiceDisplayLabel(voice);
  const peaks = useMemo(() => {
    if (waveformBars) return waveformBars;
    // Deterministic placeholder seeded from voice name
    let h = 2166136261;
    for (let i = 0; i < voice.name.length; i++) { h ^= voice.name.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
    const out: number[] = [];
    let i = 0;
    while (i < 220) {
      const silence = rand() < 0.18;
      const len = silence ? 3 + Math.floor(rand() * 8) : 10 + Math.floor(rand() * 30);
      const peak = silence ? 0.05 : 0.4 + rand() * 0.6;
      for (let j = 0; j < len && i < 220; j++, i++) {
        out.push(Math.max(0.03, peak * Math.sin(Math.PI * (j / len)) * (0.7 + rand() * 0.6)));
      }
    }
    return out;
  }, [voice.name, waveformBars]);

  useEffect(() => { if (activeVoiceId !== voice.name && playing) setPlaying(false); }, [activeVoiceId, voice.name, playing]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !blobUrl) return;
    const onTime = () => setProgress(a.currentTime);
    const onDur = () => { if (isFinite(a.duration)) setDuration(a.duration); };
    const onEnded = () => { setPlaying(false); setProgress(0); onActivateRef.current(null); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("durationchange", onDur);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("durationchange", onDur);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("ended", onEnded);
    };
  }, [blobUrl]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  // Canvas draw loop
  useEffect(() => {
    if (activeVoiceId !== voice.name && audioStatus !== "ready") return;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const barW = 2;
        const gap = 2;
        const slot = barW + gap;
        const count = Math.floor(w / slot);
        const playedX = duration > 0 ? (progress / duration) * w : 0;
        const hoverX = hover != null ? hover * w : null;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, BRAND);
        grad.addColorStop(0.55, BRAND_SECONDARY);
        grad.addColorStop(1, BRAND_WARM);
        for (let i = 0; i < count; i++) {
          const p = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
          const bh = Math.max(2, p * (h * 0.85));
          const x = i * slot;
          const y = (h - bh) / 2;
          const isPlayed = audioStatus === "ready" && x < playedX;
          const inHover = audioStatus === "ready" && hoverX != null && x >= playedX && x < hoverX;
          ctx.globalAlpha = audioStatus === "loading" ? 0.22 : 1;
          ctx.fillStyle = isPlayed ? grad : inHover ? BRAND : "oklch(0.55 0.04 240 / 0.3)";
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.moveTo(x + 1, y); ctx.arcTo(x + barW, y, x + barW, y + bh, 1);
          ctx.arcTo(x + barW, y + bh, x, y + bh, 1); ctx.arcTo(x, y + bh, x, y, 1);
          ctx.arcTo(x, y, x + barW, y, 1); ctx.closePath(); ctx.fill();
        }
        if (audioStatus === "ready" && duration > 0) {
          ctx.strokeStyle = BRAND_WARM;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(playedX, 3); ctx.lineTo(playedX, h - 3); ctx.stroke();
          ctx.fillStyle = BRAND_WARM;
          ctx.beginPath(); ctx.arc(playedX, h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    };
    draw();
    return undefined;
  }, [activeVoiceId, audioStatus, duration, hover, peaks, progress, voice.name]);

  const handlePlay = async () => {
    if (audioStatus === "loading") return;
    if (audioStatus === "idle") {
      onActivate(voice.name);
      setAudioStatus("loading");
      try {
        const r = await fetch(`/api/v1/voices/${encodeURIComponent(voice.name)}/audio`);
        if (!r.ok) throw new Error("Not found");
        const blob = await r.blob();
        // Decode PCM for real waveform
        blob.arrayBuffer().then((ab) => {
          const tmp = new AudioContext();
          tmp.decodeAudioData(ab, (buf) => {
            const ch = buf.getChannelData(0);
            const buckets = 220;
            const size = Math.max(1, Math.floor(ch.length / buckets));
            const raw: number[] = [];
            for (let i = 0; i < buckets; i++) {
              let sum = 0;
              for (let j = 0; j < size; j++) sum += ch[i * size + j] ** 2;
              raw.push(Math.sqrt(sum / size));
            }
            const mx = Math.max(...raw, 0.001);
            setWaveformBars(raw.map((p) => p / mx));
            tmp.close();
          });
        });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setAudioStatus("ready");
        setTimeout(() => setPlaying(true), 30);
      } catch {
        setAudioStatus("idle");
        onActivate(null);
      }
      return;
    }
    const next = !playing;
    setPlaying(next);
    onActivate(next ? voice.name : null);
  };

  const ts = new Date(voice.created_at);
  const dateLabel = ts.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  const defaultTone = voice.tags[0] ? capitalize(voice.tags[0]) : "—";
  const fmt = (s: number) => { const t = Math.max(0, Math.floor(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

  return (
    <div className={"vox-panel p-4 transition-shadow " + (selected ? "ring-2 ring-[var(--brand)]/45 shadow-[0_12px_28px_-22px_var(--brand)]" : "")}>
      {blobUrl && <audio ref={audioRef} src={blobUrl} preload="auto" className="hidden" />}

      {/* Header: name + tags + actions */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-black tracking-tight text-foreground">{displayLabel}</div>
          {voice.description && <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{voice.description}</div>}
          {voice.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {voice.tags.map((t) => <span key={t} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={tagStyle(t)}>{t}</span>)}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={onUse} className="vox-control px-3 py-1.5 text-[12.5px] font-semibold">Use</button>
          <button type="button" onClick={onSelect} aria-pressed={selected} className={"vox-control px-2.5 py-1.5 text-[12px] font-semibold " + (selected ? "border-[var(--brand)]/45 bg-[var(--brand-soft)] text-[var(--brand)]" : "")}>{selected ? "Selected" : "Details"}</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="More options" className="vox-control flex h-8 w-8 items-center justify-center">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="vox-popover w-48">
              <DropdownMenuItem onClick={() => setEditing((v) => !v)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Edit profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={`/api/v1/voices/${encodeURIComponent(voice.name)}/audio`} download={`${voice.name}.wav`} className="flex cursor-pointer items-center">
                  <Download className="mr-2 h-3.5 w-3.5" />Download sample
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-[oklch(0.55_0.22_25)] focus:text-[oklch(0.5_0.22_25)]"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Meta label="Source" value="Local" />
        <Meta label="Added" value={dateLabel} />
        <Meta label="Default Tone" value={defaultTone} />
      </div>

      {editing && (
        <EditForm
          voice={voice}
          onSave={() => { setEditing(false); onSaved(); }}
          onCancel={() => setEditing(false)}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete voice profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {displayLabel} from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteDialogOpen(false);
                onDelete();
              }}
              className="bg-[oklch(0.55_0.22_25)] text-white hover:bg-[oklch(0.5_0.22_25)]"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mini player */}
      <div className="mt-3 flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[var(--card)] to-[var(--background)] px-3 py-2.5">
        {/* Gradient play button */}
        <button
          onClick={handlePlay}
          aria-label={playing ? `Pause ${displayLabel}` : `Play ${displayLabel}`}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(135deg, var(--brand), var(--brand-secondary), oklch(0.6 0.22 25))",
            boxShadow: "0 8px 18px -10px oklch(0.55 0.22 280 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.3)",
          }}
        >
          {playing && <span className="absolute inset-0 -m-0.5 animate-ping rounded-full border-2 border-[oklch(0.6_0.22_280)]/30" />}
          {audioStatus === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : playing ? (
            <Pause className="h-3.5 w-3.5" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
          )}
        </button>

        {/* Time */}
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/55">{fmt(progress)}</span>

        {/* Waveform canvas */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.5), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.45), transparent 60%)" }}
          />
          <canvas
            ref={canvasRef}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              if (audioStatus !== "ready" || !duration) { void handlePlay(); return; }
              const r = e.currentTarget.getBoundingClientRect();
              const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
              const a = audioRef.current;
              if (a) { a.currentTime = pct * duration; setProgress(pct * duration); }
            }}
            className="relative block h-9 w-full cursor-pointer"
          />
        </div>

        {/* Duration */}
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/40">
          {duration > 0 ? fmt(duration) : "—:——"}
        </span>

        {/* Volume pill */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-1.5 py-1">
          <button
            onClick={() => setVolume((v) => v === 0 ? 0.8 : 0)}
            className="text-foreground/60 hover:text-foreground"
            aria-label={volume === 0 ? "Unmute" : "Mute"}
          >
            {volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <div className="relative hidden h-1 w-16 rounded-full bg-muted sm:block">
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{ width: `${volume * 100}%`, background: "linear-gradient(90deg, var(--brand), var(--brand-warm))" }}
            />
            <input
              type="range" min={0} max={1} step={0.01} value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
              aria-label="Volume"
            />
            <span
              className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[oklch(0.6_0.2_265)] shadow"
              style={{ left: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

function EditForm({
  voice, onSave, onCancel,
}: {
  voice: ApiVoice;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(voiceDisplayLabel(voice));
  const [description, setDescription] = useState(voice.description ?? "");
  const [tags, setTags] = useState(voice.tags.join(", "));
  const [iconPreview, setIconPreview] = useState<string | null>(voice.icon_data);
  const [iconError, setIconError] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { data: presets = {} } = useQuery({ queryKey: ["presets"], queryFn: listPresets, staleTime: 5 * 60 * 1000 });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getServerSettings, staleTime: 5 * 60 * 1000 });
  const iconMaxKb = settings?.voice_icon_max_kb ?? 100;
  const iconInputRef = useRef<HTMLInputElement>(null);

  const processImageBlob = (blob: Blob) => {
    setIconError("");
    if (!blob.type.startsWith("image/")) { setIconError("Clipboard content is not an image."); return; }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d")!.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrlBytes(dataUrl) > iconMaxKb * 1024) {
        setIconError(`Icon is too large after processing. Max ${iconMaxKb} KB.`);
      } else {
        setIconPreview(dataUrl);
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { setIconError("Could not load image."); URL.revokeObjectURL(url); };
    img.src = url;
  };

  const handleIconFile = (file: File) => processImageBlob(file);

  const handleIconPaste = (e: React.ClipboardEvent | ClipboardEvent) => {
    const items = Array.from((e as React.ClipboardEvent).clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const blob = imageItem.getAsFile();
    if (blob) processImageBlob(blob);
  };

  const handleSave = async () => {
    setSaving(true); setSaveError("");
    try {
      const trimmedLabel = label.trim();
      const presetParams = selectedPreset ? (presets[selectedPreset] as PresetParams | undefined) : undefined;
      await patchVoice(voice.name, {
        display_name: trimmedLabel && trimmedLabel !== slugToTitle(voice.name) ? trimmedLabel : undefined,
        description: description.trim() || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        icon_data: iconPreview !== voice.icon_data ? (iconPreview ?? null) : undefined,
        ...(presetParams && {
          temperature: presetParams.temperature,
          exaggeration: presetParams.exaggeration,
          cfg_weight: presetParams.cfg_weight,
          repetition_penalty: presetParams.repetition_penalty,
          top_p: presetParams.top_p,
          min_p: presetParams.min_p,
        }),
      });
      onSave();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-[oklch(0.88_0.06_260)] bg-[oklch(0.98_0.015_260)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12.5px] font-bold uppercase tracking-wide text-[oklch(0.55_0.22_260)]">Edit Profile</span>
        <button onClick={onCancel} className="text-foreground/40 hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[12px] font-semibold text-foreground">Display name</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[oklch(0.55_0.22_260)]" />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-foreground">Tags <span className="font-normal text-muted-foreground">(comma-separated)</span></label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="narration, calm, male" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[oklch(0.55_0.22_260)]" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[12px] font-semibold text-foreground">Description</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Calm narrator for long-form content" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[oklch(0.55_0.22_260)]" />
        </div>

        <div className="sm:col-span-2">
          <label className="text-[12px] font-semibold text-foreground">
            Default tone <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          {voice.exaggeration != null && !selectedPreset && (
            <p className="mb-1 text-[11px] text-muted-foreground">
              Current: custom parameters set — select a preset to replace them
            </p>
          )}
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13.5px] text-foreground capitalize outline-none focus:border-[oklch(0.55_0.22_260)]"
          >
            <option value="">— No change —</option>
            {Object.keys(presets).map((name) => (
              <option key={name} value={name} className="capitalize">{name}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">Applied whenever this voice is used for generation</p>
        </div>

        {/* Icon upload */}
        <div className="sm:col-span-2">
          <label className="text-[12px] font-semibold text-foreground">
            Profile icon <span className="font-normal text-muted-foreground">(optional · any image · auto-cropped to square)</span>
          </label>
          <div className="mt-1 flex items-center gap-3">
            {iconPreview ? (
              <div
                className="group relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-full border border-border focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.22_260)] focus:ring-offset-1"
                tabIndex={0}
                onPaste={handleIconPaste}
                onContextMenu={(e) => e.currentTarget.focus()}
                title="Paste image (⌘V) or click × to remove"
              >
                <img src={iconPreview} alt="Icon preview" className="h-full w-full object-cover" />
                <button
                  onClick={() => setIconPreview(null)}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove icon"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 cursor-pointer flex-col items-center justify-center rounded-full border border-dashed border-border bg-white text-foreground/30 transition-colors hover:border-[oklch(0.55_0.22_260)] hover:text-[oklch(0.55_0.22_260)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.22_260)] focus:ring-offset-1"
                tabIndex={0}
                onPaste={handleIconPaste}
                onContextMenu={(e) => e.currentTarget.focus()}
                title="Paste image (⌘V) or click Upload"
              >
                <Clipboard className="h-4 w-4" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIconFile(f); }} />
              <button onClick={() => iconInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-medium text-foreground/80 hover:bg-muted">
                <ImagePlus className="h-3.5 w-3.5" />{iconPreview ? "Change icon" : "Upload icon"}
              </button>
              <p className="text-[11px] text-muted-foreground">or click icon and paste (⌘V) · max {iconMaxKb} KB</p>
            </div>
          </div>
          {iconError && <p className="mt-1.5 text-[11.5px] text-[oklch(0.52_0.18_25)]">{iconError}</p>}
        </div>
      </div>

      {saveError && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[oklch(0.82_0.08_25)] bg-[var(--brand-soft)] px-3 py-2 text-[12px] text-[oklch(0.52_0.18_25)]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{saveError}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-foreground/70 hover:bg-muted">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60" style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-secondary))" }}>
          {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Check className="h-3.5 w-3.5" /> Save changes</>}
        </button>
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-[12.5px] font-medium text-foreground/85">{value}</div>
    </div>
  );
}
