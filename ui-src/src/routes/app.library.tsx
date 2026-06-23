import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ApiVoice, listVoices, uploadVoice, deleteVoice, patchVoice } from "@/lib/api";

export const Route = createFileRoute("/app/library")({
  head: () => ({ meta: [{ title: "Library — Vox Studio" }] }),
  component: VoicesPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugToTitle(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function voiceDisplayLabel(v: ApiVoice): string {
  return v.display_name ?? slugToTitle(v.name);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function VoicesPage() {
  const [tab, setTab] = useState<"upload" | "record">("record");
  const [query, setQuery] = useState("");
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: voices = [], isLoading } = useQuery({
    queryKey: ["voices"],
    queryFn: listVoices,
  });

  const filtered = voices.filter(
    (v) =>
      voiceDisplayLabel(v).toLowerCase().includes(query.toLowerCase()) ||
      v.name.toLowerCase().includes(query.toLowerCase()) ||
      (v.description ?? "").toLowerCase().includes(query.toLowerCase()) ||
      v.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())),
  );

  const handleUse = (voice: ApiVoice) => {
    localStorage.setItem("vox:voiceId", JSON.stringify(voice.name));
    navigate({ to: "/app/" });
  };

  const handleDelete = async (voice: ApiVoice) => {
    await deleteVoice(voice.name);
    queryClient.invalidateQueries({ queryKey: ["voices"] });
    if (activeVoiceId === voice.name) setActiveVoiceId(null);
  };

  const handleUploaded = () => queryClient.invalidateQueries({ queryKey: ["voices"] });

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-black tracking-tight text-foreground">Library</h1>
        <div className="inline-flex rounded-xl border border-border bg-white p-1 shadow-sm">
          <button
            onClick={() => setTab("upload")}
            className={
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all " +
              (tab === "upload"
                ? "bg-gradient-to-br from-[oklch(0.72_0.17_150)] to-[oklch(0.55_0.18_150)] text-white shadow-[0_2px_8px_oklch(0.55_0.18_150/0.35)]"
                : "text-foreground/60 hover:bg-[oklch(0.96_0.04_150)] hover:text-[oklch(0.5_0.18_150)]")
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
                ? "bg-gradient-to-br from-[oklch(0.7_0.2_25)] to-[oklch(0.55_0.22_25)] text-white shadow-[0_2px_8px_oklch(0.55_0.22_25/0.4)]"
                : "text-foreground/60 hover:bg-[oklch(0.96_0.04_25)] hover:text-[oklch(0.55_0.22_25)]")
            }
          >
            <span className="relative flex h-2 w-2">
              {tab === "record" && <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />}
              <span className={"relative h-2 w-2 rounded-full " + (tab === "record" ? "bg-white" : "bg-[oklch(0.6_0.22_25)]")} />
            </span>
            Record
          </button>
          <button
            disabled
            title="Coming soon"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-[oklch(0.55_0.22_260)]/40"
          >
            <Globe className="h-3.5 w-3.5" />
            URL
            <span className="rounded-md bg-[oklch(0.95_0.04_260)] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[oklch(0.55_0.22_260)]">
              Soon
            </span>
          </button>
        </div>
      </div>

      {/* Panel */}
      <section className="rounded-2xl border border-border bg-white p-6">
        {tab === "upload" ? (
          <UploadPane onUploaded={handleUploaded} />
        ) : (
          <RecordPane onSaved={handleUploaded} />
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

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-foreground/40">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white py-14 text-center">
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
              onActivate={setActiveVoiceId}
              onUse={() => handleUse(v)}
              onDelete={() => handleDelete(v)}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["voices"] })}
            />
          ))}
        </div>
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

function UploadPane({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const pickFile = (f: File) => {
    setFile(f);
    setStatus("idle");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setPlaying(false);
    if (!voiceName) setVoiceName(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").slice(0, 40));
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => setPlaying(false);
    a.addEventListener("ended", onEnded);
    return () => a.removeEventListener("ended", onEnded);
  }, [previewUrl]);

  const handleCreate = async () => {
    if (!file || !voiceName.trim()) return;
    setStatus("uploading");
    setErrorMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", voiceName.trim());
      if (tags.trim()) fd.append("tags", tags.trim());
      if (description.trim()) fd.append("description", description.trim());
      await uploadVoice(fd);
      setStatus("done");
      onUploaded();
      setTimeout(() => {
        setFile(null); setVoiceName(""); setTags(""); setDescription("");
        setPreviewUrl(null); setPlaying(false); setStatus("idle");
        if (fileRef.current) fileRef.current.value = "";
      }, 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
    }
  };

  const canCreate = !!file && !!voiceName.trim() && status !== "uploading";

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-3">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
          className={"flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors " + (dragOver ? "border-[oklch(0.55_0.22_260)] bg-[oklch(0.98_0.02_260)]" : file ? "border-[oklch(0.7_0.15_150)] bg-[oklch(0.98_0.02_150)]" : "border-border bg-[oklch(0.985_0.005_260)] hover:bg-muted/40")}
        >
          <input ref={fileRef} type="file" accept=".wav,.m4a,.mp3,.aiff,.flac,.ogg,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
          {file ? (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(0.93_0.08_150)]"><Check className="h-5 w-5 text-[oklch(0.5_0.18_150)]" /></span>
              <div className="mt-3 text-[15px] font-semibold text-foreground">{file.name}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</div>
            </>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(0.95_0.04_260)]"><UploadCloud className="h-5 w-5 text-[oklch(0.55_0.22_260)]" /></span>
              <div className="mt-4 text-[15px] font-semibold text-foreground">Upload voice sample</div>
              <div className="mt-1 text-[13px] text-muted-foreground">Drag and drop, or click to browse</div>
              <div className="mt-3 text-[12px] tracking-wide text-muted-foreground/70">WAV · M4A · MP3 · AIFF · FLAC · OGG</div>
            </>
          )}
        </label>
        {previewUrl && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-[oklch(0.985_0.005_260)] px-3 py-3">
            <audio ref={audioRef} src={previewUrl} preload="auto" />
            <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play preview"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[oklch(0.95_0.04_260)] text-[oklch(0.55_0.22_260)] hover:bg-[oklch(0.92_0.05_260)]">
              {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
            </button>
            <Waveform animated={false} />
            <button onClick={() => { setFile(null); setPreviewUrl(null); setPlaying(false); setVoiceName(""); if (fileRef.current) fileRef.current.value = ""; }} className="ml-1 shrink-0 text-foreground/40 hover:text-foreground" aria-label="Remove file"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[13px] font-semibold text-foreground">Voice name <span className="text-[oklch(0.55_0.22_25)]">*</span></label>
          <input value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="e.g. My Narrator" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]" />
        </div>
        <div>
          <label className="text-[13px] font-semibold text-foreground">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Calm narrator for long-form content" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]" />
        </div>
        <div>
          <label className="text-[13px] font-semibold text-foreground">Tags <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="narration, calm, male" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]" />
          <div className="mt-1 text-[11.5px] text-muted-foreground">Comma-separated</div>
        </div>
        {status === "error" && (
          <div className="flex items-center gap-2 rounded-lg border border-[oklch(0.82_0.08_25)] bg-[oklch(0.98_0.02_25)] px-3 py-2 text-[12.5px] text-[oklch(0.52_0.18_25)]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{errorMsg}
          </div>
        )}
        <button onClick={handleCreate} disabled={!canCreate} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))", boxShadow: "0 10px 24px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)" }}>
          {status === "uploading" ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : status === "done" ? <><Check className="h-4 w-4" /> Profile created!</> : "Create Voice Profile"}
        </button>
      </div>
    </div>
  );
}

// ─── Record Pane ────────────────────────────────────────────────────────────

function RecordPane({ onSaved }: { onSaved: () => void }) {
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "no-device">("unknown");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [tags, setTags] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const MAX = 5 * 60;

  useEffect(() => {
    if (recordingState !== "recording") return;
    const id = window.setInterval(() => { setElapsed((e) => { if (e + 1 >= MAX) { stopRecording(); return MAX; } return e + 1; }); }, 1000);
    return () => window.clearInterval(id);
  }, [recordingState]);

  useEffect(() => { const a = audioRef.current; if (!a) return; if (playing) a.play().catch(() => setPlaying(false)); else a.pause(); }, [playing]);
  useEffect(() => { const a = audioRef.current; if (!a) return; const onEnded = () => setPlaying(false); a.addEventListener("ended", onEnded); return () => a.removeEventListener("ended", onEnded); }, [recordedUrl]);

  const classifyMicError = (err: unknown) => {
    const name = err instanceof Error ? err.name : "";
    setPermission(name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotReadableError" ? "no-device" : "denied");
  };

  const refreshDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const mics = all.filter((d) => d.kind === "audioinput");
    setDevices(mics);
    if (mics.length > 0 && !mics.find((d) => d.deviceId === selectedDeviceId)) setSelectedDeviceId(mics[0].deviceId);
  };

  const getAudioConstraints = () => selectedDeviceId ? { audio: { deviceId: { exact: selectedDeviceId } } } : { audio: true };

  const requestMic = async () => {
    try { const stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints()); streamRef.current = stream; setPermission("granted"); await refreshDevices(); }
    catch (err) { classifyMicError(err); }
  };

  const switchDevice = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (permission !== "granted" || recordingState === "recording") return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } }); streamRef.current = stream; }
    catch (err) { classifyMicError(err); }
  };

  const startRecording = async () => {
    let stream = streamRef.current;
    if (!stream) {
      try { stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints()); streamRef.current = stream; setPermission("granted"); await refreshDevices(); }
      catch (err) { classifyMicError(err); return; }
    }
    chunksRef.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => { const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" }); setRecordedBlob(blob); if (recordedUrl) URL.revokeObjectURL(recordedUrl); setRecordedUrl(URL.createObjectURL(blob)); };
    mediaRecorderRef.current = mr; mr.start(250); setRecordingState("recording"); setElapsed(0); setSaveStatus("idle");
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setRecordingState("done"); setPlaying(false); };

  const discard = () => {
    mediaRecorderRef.current?.stop(); setRecordingState("idle"); setElapsed(0); setRecordedBlob(null);
    if (recordedUrl) { URL.revokeObjectURL(recordedUrl); setRecordedUrl(null); }
    setPlaying(false); setSaveStatus("idle");
  };

  const handleSave = async () => {
    if (!recordedBlob || !voiceName.trim()) return;
    setSaveStatus("saving"); setSaveError("");
    try {
      const ext = recordedBlob.type.includes("ogg") ? "ogg" : recordedBlob.type.includes("mp4") ? "m4a" : "webm";
      const file = new File([recordedBlob], `recording.${ext}`, { type: recordedBlob.type });
      const fd = new FormData(); fd.append("file", file); fd.append("name", voiceName.trim());
      if (tags.trim()) fd.append("tags", tags.trim());
      await uploadVoice(fd); setSaveStatus("done"); onSaved();
      setTimeout(() => { discard(); setVoiceName(""); setTags(""); setSaveStatus("idle"); }, 2000);
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Save failed"); setSaveStatus("error"); }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (permission === "no-device") return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[oklch(0.82_0.08_40)] bg-[oklch(0.985_0.01_40)] py-12 text-center">
      <Mic className="h-8 w-8 text-[oklch(0.6_0.14_40)]" />
      <p className="text-[14px] font-semibold text-foreground">No microphone detected</p>
      <p className="max-w-xs text-[12.5px] text-muted-foreground">Connect a microphone and try again, or use the <strong>Upload</strong> tab to add an existing audio file.</p>
      <button onClick={() => setPermission("unknown")} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-medium text-foreground/80 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" />Try again</button>
    </div>
  );

  if (permission === "denied") return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[oklch(0.82_0.08_25)] bg-[oklch(0.985_0.01_25)] py-12 text-center">
      <AlertCircle className="h-8 w-8 text-[oklch(0.6_0.18_25)]" />
      <p className="text-[14px] font-semibold text-foreground">Microphone access denied</p>
      <p className="max-w-xs text-[12.5px] text-muted-foreground">Open your browser's site settings, allow microphone access for this page, then reload.</p>
      <button onClick={requestMic} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] font-medium text-foreground/80 hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" />Try again</button>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-[oklch(0.985_0.005_260)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-foreground">Record voice sample</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Speak clearly in a quiet environment.</p>
        </div>
        {permission === "granted" && (
          <div className="flex items-center gap-2">
            {devices.length > 1 ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5">
                <Mic className="h-3.5 w-3.5 shrink-0 text-[oklch(0.55_0.18_145)]" />
                <select value={selectedDeviceId} onChange={(e) => switchDevice(e.target.value)} disabled={recordingState === "recording"} className="max-w-[200px] bg-transparent text-[12.5px] font-medium text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60">
                  {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${devices.indexOf(d) + 1}`}</option>)}
                </select>
              </div>
            ) : (
              <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[oklch(0.55_0.18_145)]">
                <Mic className="h-3.5 w-3.5" />{devices[0]?.label || "Mic ready"}
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.7_0.18_145)]" />
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-6 flex flex-col items-center">
        {permission !== "granted" ? (
          <button onClick={requestMic} className="flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-full border-[6px] border-[oklch(0.94_0.02_260)] bg-white text-[oklch(0.55_0.22_260)] transition-all hover:border-[oklch(0.88_0.06_25)] hover:text-[oklch(0.6_0.22_25)]">
            <Mic className="h-8 w-8" /><span className="text-[10.5px] font-bold leading-none">Allow mic</span>
          </button>
        ) : (
          <button onClick={recordingState === "recording" ? stopRecording : startRecording} disabled={recordingState === "done"} aria-label={recordingState === "recording" ? "Stop recording" : "Start recording"} className={"relative flex h-28 w-28 items-center justify-center rounded-full border-[6px] transition-all disabled:cursor-not-allowed disabled:opacity-50 " + (recordingState === "recording" ? "border-[oklch(0.92_0.04_25)] bg-white" : "border-[oklch(0.94_0.02_260)] bg-white hover:border-[oklch(0.9_0.04_25)]")}>
            {recordingState === "recording" && <span className="absolute inset-0 -m-1 animate-ping rounded-full border-2 border-[oklch(0.65_0.22_25)]/40" />}
            {recordingState === "recording" ? <span className="h-10 w-10 rounded-md bg-[oklch(0.6_0.22_25)]" /> : <span className="h-14 w-14 rounded-full bg-[oklch(0.6_0.22_25)]" />}
          </button>
        )}
        <div className="mt-4 text-center">
          <div className="text-[18px] font-bold tabular-nums text-foreground">{fmt(elapsed)} <span className="font-medium text-muted-foreground">/ {fmt(MAX)}</span></div>
          <div className="mt-0.5 inline-flex items-center justify-center gap-1 text-[12px] text-muted-foreground">
            5 min max
            <span className="group relative inline-flex">
              <Info className="h-3 w-3 cursor-help text-muted-foreground/70" />
              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11.5px] font-normal leading-snug text-foreground/80 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">A clean ~30 second recording is enough for most use cases.</span>
            </span>
          </div>
        </div>
      </div>
      <div className="mt-5"><Waveform animated={recordingState === "recording"} /></div>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_1.4fr]">
        <button onClick={() => setPlaying((p) => !p)} disabled={!recordedUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[oklch(0.55_0.22_260)] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
          {playing ? <><Pause className="h-3.5 w-3.5" fill="currentColor" /> Pause</> : <><Play className="h-3.5 w-3.5" fill="currentColor" /> Play Preview</>}
        </button>
        <button onClick={stopRecording} disabled={recordingState !== "recording"} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-[oklch(0.6_0.22_25)] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
          <Square className="h-3.5 w-3.5" fill="currentColor" />Stop
        </button>
        <button onClick={discard} disabled={recordingState === "idle"} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-[13.5px] font-semibold text-foreground/70 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" />Discard
        </button>
        <button onClick={handleSave} disabled={!recordedBlob || !voiceName.trim() || saveStatus === "saving" || saveStatus === "done"} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))", boxShadow: "0 10px 24px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)" }}>
          {saveStatus === "saving" ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : saveStatus === "done" ? <><Check className="h-4 w-4" /> Saved!</> : "Save as Voice Profile"}
        </button>
      </div>
      {(recordingState === "done" || recordedBlob) && (
        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <label className="text-[13px] font-semibold text-foreground">Voice name <span className="text-[oklch(0.55_0.22_25)]">*</span></label>
            <input value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="e.g. My Narrator" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]" />
          </div>
          <div>
            <label className="text-[13px] font-semibold text-foreground">Tags <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="narration, calm, male" className="mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-muted-foreground focus:border-[oklch(0.55_0.22_260)]" />
          </div>
          {saveStatus === "error" && (
            <div className="col-span-full flex items-center gap-2 rounded-lg border border-[oklch(0.82_0.08_25)] bg-[oklch(0.98_0.02_25)] px-3 py-2 text-[12.5px] text-[oklch(0.52_0.18_25)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{saveError}
            </div>
          )}
        </div>
      )}
      {recordedUrl && <audio ref={audioRef} src={recordedUrl} preload="auto" className="hidden" />}
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

function tagStyle(tag: string): React.CSSProperties {
  const hue = nameToHue(tag);
  return {
    background: `oklch(0.94 0.07 ${hue})`,
    color: `oklch(0.38 0.12 ${hue})`,
  };
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
  voice, activeVoiceId, onActivate, onUse, onDelete, onSaved,
}: {
  voice: ApiVoice;
  activeVoiceId: string | null;
  onActivate: (id: string | null) => void;
  onUse: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioStatus, setAudioStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => { if (activeVoiceId !== voice.name && playing) setPlaying(false); }, [activeVoiceId, voice.name]);
  useEffect(() => { const a = audioRef.current; if (!a) return; if (playing) a.play().catch(() => setPlaying(false)); else a.pause(); }, [playing]);
  useEffect(() => { const a = audioRef.current; if (!a) return; const onEnded = () => { setPlaying(false); onActivateRef.current(null); }; a.addEventListener("ended", onEnded); return () => a.removeEventListener("ended", onEnded); }, [blobUrl]);

  const handlePlay = async () => {
    if (audioStatus === "loading") return;
    if (audioStatus === "idle") {
      onActivate(voice.name); setAudioStatus("loading");
      try {
        const r = await fetch(`/voices/${encodeURIComponent(voice.name)}/audio`);
        if (!r.ok) throw new Error("Not found");
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        setBlobUrl(url); setAudioStatus("ready");
        setTimeout(() => setPlaying(true), 30);
      } catch { setAudioStatus("idle"); onActivate(null); }
      return;
    }
    const next = !playing; setPlaying(next); onActivate(next ? voice.name : null);
  };

  const ts = new Date(voice.created_at);
  const dateLabel = ts.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  const displayLabel = voiceDisplayLabel(voice);

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      {blobUrl && <audio ref={audioRef} src={blobUrl} preload="auto" className="hidden" />}

      <div className="flex items-start gap-3">
        <AvatarPlayButton
          name={voice.name}
          iconUrl={voice.icon_data}
          audioStatus={audioStatus}
          playing={playing}
          displayLabel={displayLabel}
          onClick={handlePlay}
        />

        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-foreground">{displayLabel}</div>
          {voice.name !== displayLabel.toLowerCase().replace(/\s+/g, "-") && (
            <div className="text-[11px] text-muted-foreground/60 font-mono">{voice.name}</div>
          )}
          {voice.description && <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{voice.description}</div>}
          {voice.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {voice.tags.map((t) => <span key={t} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold" style={tagStyle(t)}>{t}</span>)}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={onUse} className="rounded-lg border border-border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-foreground/80 hover:bg-muted">Use</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="More options" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground/60 hover:bg-muted">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 border-border bg-white text-foreground shadow-lg">
              <DropdownMenuItem onClick={() => setEditing((v) => !v)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />Edit profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={`/voices/${encodeURIComponent(voice.name)}/audio`} download={`${voice.name}.wav`} className="flex cursor-pointer items-center">
                  <Download className="mr-2 h-3.5 w-3.5" />Download sample
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {confirmDelete ? (
                <>
                  <DropdownMenuItem onClick={onDelete} className="text-[oklch(0.55_0.22_25)] focus:text-[oklch(0.5_0.22_25)]"><Trash2 className="mr-2 h-3.5 w-3.5" />Confirm delete</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setConfirmDelete(false)}><X className="mr-2 h-3.5 w-3.5" />Cancel</DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-[oklch(0.55_0.22_25)] focus:text-[oklch(0.5_0.22_25)]"><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {editing && (
        <EditForm
          voice={voice}
          onSave={() => { setEditing(false); onSaved(); }}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <Meta label="Added" value={dateLabel} />
        <Meta label="Source" value="Local" />
        <MiniWave />
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
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
      setIconPreview(canvas.toDataURL("image/png"));
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
      await patchVoice(voice.name, {
        display_name: trimmedLabel && trimmedLabel !== slugToTitle(voice.name) ? trimmedLabel : undefined,
        description: description.trim() || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        // undefined = don't change; null = clear; string = set
        icon_data: iconPreview !== voice.icon_data ? (iconPreview ?? null) : undefined,
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
              <p className="text-[11px] text-muted-foreground">or click icon and paste (⌘V)</p>
            </div>
          </div>
          {iconError && <p className="mt-1.5 text-[11.5px] text-[oklch(0.52_0.18_25)]">{iconError}</p>}
        </div>
      </div>

      {saveError && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[oklch(0.82_0.08_25)] bg-[oklch(0.98_0.02_25)] px-3 py-2 text-[12px] text-[oklch(0.52_0.18_25)]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{saveError}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-foreground/70 hover:bg-muted">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60" style={{ background: "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))" }}>
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

function Waveform({ animated = false }: { animated?: boolean }) {
  const bars = 64;
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!animated) return; const id = window.setInterval(() => setTick((t) => t + 1), 120); return () => window.clearInterval(id); }, [animated]);
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => {
        const seed = animated ? i * 0.7 + tick * 0.4 : i * 0.7;
        const h = 20 + Math.abs(Math.sin(seed)) * 70 + (i % 5) * 4;
        return <span key={i} className="block min-w-[2px] flex-1 rounded-full bg-[oklch(0.55_0.22_260)]/55" style={{ height: `${Math.min(100, h)}%` }} />;
      })}
    </div>
  );
}

function MiniWave() {
  const heights = [30, 55, 40, 80, 60, 90, 50, 70, 35, 65, 45, 75, 30, 55];
  return (
    <div className="flex h-5 items-center gap-[1.5px]">
      {heights.map((h, i) => <span key={i} className="block w-[2px] rounded-full bg-[oklch(0.55_0.22_260)]/55" style={{ height: `${h}%` }} />)}
    </div>
  );
}
