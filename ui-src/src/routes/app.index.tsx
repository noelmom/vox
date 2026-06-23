import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Pause,
  Info,
  Filter,
  Download,
  RefreshCw,
  MoreVertical,
  Play,
  Volume2,
  VolumeX,
  AudioLines,
  Sparkles,
  Keyboard,
  Disc3,
  Star,
  Check,
  Plus,
  Upload,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  Pencil,
  ArrowUpDown,
  CheckCircle2,
} from "lucide-react";
import { type ApiVoice, type Job, listVoices, listPresets, listJobs, submitTTS, getJob, getJobAudio, savePreset, deletePreset, deleteJob, patchVoice } from "@/lib/api";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Generate — Vox Studio" },
      { name: "description", content: "Turn scripts into private, local speech." },
    ],
  }),
  component: GeneratePage,
});

type VoiceCategory = "Narration" | "Character" | "Conversational" | "Custom";
type Voice = {
  id: string;
  name: string;
  displayName: string;
  category: VoiceCategory;
  tags: string[];
  accent: "indigo" | "teal" | "amber" | "rose" | "violet" | "slate";
  isFavorite: boolean;
  iconData: string | null;
};

const ACCENT_CYCLE: Voice["accent"][] = ["indigo", "teal", "amber", "rose", "violet", "slate"];

function slugToTitle(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const GENERIC_VOICE: Voice = {
  id: "",
  name: "Generic",
  displayName: "Generic",
  category: "Custom",
  tags: ["Default", "Balanced"],
  accent: "slate",
  isFavorite: false,
  iconData: null,
};

function toDisplayVoice(v: ApiVoice, idx: number): Voice {
  const accent = ACCENT_CYCLE[idx % ACCENT_CYCLE.length];
  const cat: VoiceCategory =
    v.tags.includes("Narration") ? "Narration" :
    v.tags.includes("Character") ? "Character" :
    v.tags.includes("Conversational") ? "Conversational" : "Custom";
  return {
    id: v.name,
    name: v.name,
    displayName: v.display_name ?? slugToTitle(v.name),
    category: cat,
    tags: v.tags,
    accent,
    isFavorite: v.is_favorite,
    iconData: v.icon_data,
  };
}

const ACCENT_BG: Record<Voice["accent"], string> = {
  indigo: "oklch(0.55 0.22 260)",
  teal: "oklch(0.62 0.13 175)",
  amber: "oklch(0.72 0.16 70)",
  rose: "oklch(0.62 0.20 15)",
  violet: "oklch(0.55 0.20 300)",
  slate: "oklch(0.16 0.02 260)",
};

const VOICE_FILTERS: ("All" | VoiceCategory)[] = ["All", "Narration", "Conversational", "Character", "Custom"];

const ADVANCED_DEFAULTS = {
  exaggeration: 0.5,
  cfg: 0.5,
  temperature: 0.8,
  repetition: 1.2,
  topP: 1,
  minP: 0.05,
};

const ADVANCED_FIELDS: {
  key: keyof typeof ADVANCED_DEFAULTS;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "exaggeration", label: "Exaggeration", hint: "Delivery drama & pace. Higher = more expressive.", min: 0, max: 1, step: 0.05 },
  { key: "cfg", label: "CFG Weight", hint: "How closely the model follows the voice prompt.", min: 0, max: 1, step: 0.05 },
  { key: "temperature", label: "Temperature", hint: "Randomness. Higher = more varied, natural delivery.", min: 0, max: 1.5, step: 0.05 },
  { key: "repetition", label: "Repetition Penalty", hint: "Discourages repeated sounds. Keep near 1.2.", min: 1, max: 2, step: 0.05 },
  { key: "topP", label: "Top P", hint: "Nucleus sampling threshold.", min: 0, max: 1, step: 0.05 },
  { key: "minP", label: "Min P", hint: "Minimum token probability floor.", min: 0, max: 1, step: 0.01 },
];

const MP3_PRESETS = [
  { id: "96", label: "96 kbps", desc: "Smallest · voice memos" },
  { id: "128", label: "128 kbps", desc: "Default · web sharing" },
  { id: "192", label: "192 kbps", desc: "High · podcast" },
  { id: "256", label: "256 kbps", desc: "Very high" },
  { id: "320", label: "320 kbps", desc: "Max MP3 bitrate" },
] as const;

// WAV output is always 24 kHz (native model sample rate) — only bit depth varies
const WAV_PRESETS = [
  { id: "16",  label: "16-bit · 24 kHz", short: "16-bit · 24k", desc: "Default · smallest" },
  { id: "24",  label: "24-bit · 24 kHz", short: "24-bit · 24k", desc: "Studio · editing" },
  { id: "32f", label: "32-bit float · 24 kHz", short: "32f · 24k", desc: "Archival · max fidelity" },
] as const;

function useLocalStorage<T>(key: string, defaultValue: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const setStored = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    [key],
  );
  return [state, setStored] as const;
}

// Built-in preset keys (lowercase) — cannot be removed by the user
const BUILTIN_PRESET_KEYS = new Set(["default", "youtube", "hype", "news"]);

function presetToAdvanced(p: Record<string, number>): typeof ADVANCED_DEFAULTS {
  return {
    exaggeration: p.exaggeration ?? ADVANCED_DEFAULTS.exaggeration,
    cfg: p.cfg_weight ?? ADVANCED_DEFAULTS.cfg,
    temperature: p.temperature ?? ADVANCED_DEFAULTS.temperature,
    repetition: p.repetition_penalty ?? ADVANCED_DEFAULTS.repetition,
    topP: p.top_p ?? ADVANCED_DEFAULTS.topP,
    minP: p.min_p ?? ADVANCED_DEFAULTS.minP,
  };
}

type GenResult = { job: Job; blob: Blob; url: string };

type GenState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "polling"; requestId: string }
  | { phase: "done"; result: GenResult }
  | { phase: "error"; message: string };

const SAMPLE_SCRIPT =
  "Welcome to Vox Studio — a private, on-device voice lab.\n\nEverything you type here is synthesized locally on your Mac. No cloud uploads, no accounts, no telemetry. Just paste a script, pick a voice, and hit Generate.\n\nTry it: change the voice on the right, drag the Expressiveness slider, and listen to how the same words come alive.";

function GeneratePage() {
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [tone, setTone] = useLocalStorage("vox:tone", "Default");
  const [format, setFormat] = useLocalStorage<"mp3" | "wav">("vox:format", "mp3");
  const [mp3Quality, setMp3Quality] = useLocalStorage("vox:mp3Quality", "128");
  const [wavQuality, setWavQuality] = useLocalStorage("vox:wavQuality", "16");
  const [advancedOpen, setAdvancedOpen] = useLocalStorage("vox:advancedOpen", false);
  const [advanced, setAdvanced] = useLocalStorage("vox:advanced", ADVANCED_DEFAULTS);
  const [voiceId, setVoiceId] = useLocalStorage("vox:voiceId", "");
  const [optimisticFavorites, setOptimisticFavorites] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [outputSort, setOutputSort] = useState<"desc" | "asc">("desc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [genState, setGenState] = useState<GenState>({ phase: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef(false);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);
  const [savePresetError, setSavePresetError] = useState("");
  const [editPresetOpen, setEditPresetOpen] = useState(false);
  const [editPresetNameInput, setEditPresetNameInput] = useState("");
  const [editingPreset, setEditingPreset] = useState(false);
  const [editPresetError, setEditPresetError] = useState("");
  const queryClient = useQueryClient();

  const { data: voicesData } = useQuery({ queryKey: ["voices"], queryFn: listVoices });
  const { data: presetsData } = useQuery({ queryKey: ["presets"], queryFn: listPresets });
  const { data: jobsData } = useQuery({ queryKey: ["jobs"], queryFn: () => listJobs({ limit: 100 }) });

  const displayVoices = useMemo<Voice[]>(() => {
    if (!voicesData) return [GENERIC_VOICE];
    return [GENERIC_VOICE, ...voicesData.map((v, i) => {
      const dv = toDisplayVoice(v, i);
      // Apply optimistic overrides so toggle feels instant
      if (optimisticFavorites[dv.id] !== undefined) dv.isFavorite = optimisticFavorites[dv.id];
      return dv;
    })];
  }, [voicesData, optimisticFavorites]);

  // Derived favorites list for VoicePicker sort/star logic
  const favorites = displayVoices.filter((v) => v.isFavorite).map((v) => v.id);

  // tones: display names in order; toneKeyMap: displayName → API key
  const { tones, toneKeyMap } = useMemo(() => {
    if (!presetsData) return { tones: ["Default", "Custom"], toneKeyMap: {} as Record<string, string> };
    const map: Record<string, string> = {};
    const names = Object.keys(presetsData).map((k) => {
      const display = k.charAt(0).toUpperCase() + k.slice(1);
      map[display] = k;
      return display;
    });
    return { tones: [...names, "Custom"], toneKeyMap: map };
  }, [presetsData]);

  // Only validate tone once presets have loaded — avoids resetting a valid saved
  // tone while presetsData is still undefined and tones is just ["Default","Custom"]
  useEffect(() => {
    if (!presetsData) return;
    if (!tones.includes(tone)) setTone(tones[0]);
  }, [tones, tone, presetsData]);

  // One-shot: pre-fill script from History "Regenerate" action
  useEffect(() => {
    const regenText = localStorage.getItem("vox:regenText");
    if (regenText) {
      setScript(regenText);
      localStorage.removeItem("vox:regenText");
    }
  }, []);

  const max = 3000;

  // Values the sliders should compare against for the "Modified" badge
  const baseAdvanced = useMemo(() => {
    if (tone === "Custom") return ADVANCED_DEFAULTS;
    const key = toneKeyMap[tone];
    const preset = key && presetsData ? presetsData[key] : null;
    return preset ? presetToAdvanced(preset as Record<string, number>) : ADVANCED_DEFAULTS;
  }, [tone, toneKeyMap, presetsData]);

  const isDirty = ADVANCED_FIELDS.some((f) => advanced[f.key] !== baseAdvanced[f.key]);

  // Is the active tone a user-created (non-built-in) preset?
  const isUserPreset = tone !== "Custom" && !!toneKeyMap[tone] && !BUILTIN_PRESET_KEYS.has(toneKeyMap[tone]);
  const selectedVoice = displayVoices.find((v) => v.id === voiceId) ?? GENERIC_VOICE;
  const toggleFavorite = (id: string) => {
    const current = displayVoices.find((v) => v.id === id)?.isFavorite ?? false;
    const next = !current;
    setOptimisticFavorites((prev) => ({ ...prev, [id]: next }));
    patchVoice(id, { is_favorite: next })
      .then(() => queryClient.invalidateQueries({ queryKey: ["voices"] }))
      .catch(() => setOptimisticFavorites((prev) => ({ ...prev, [id]: current })));
  };

  const isGenerating = genState.phase === "submitting" || genState.phase === "polling";

  // Elapsed timer during generation
  useEffect(() => {
    if (!isGenerating) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [isGenerating]);

  // Abort polling on unmount
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  const handleGenerate = async () => {
    if (!script.trim() || isGenerating) return;
    abortRef.current = false;

    // Revoke previous blob URL
    if (genState.phase === "done") URL.revokeObjectURL(genState.result.url);

    setGenState({ phase: "submitting" });

    try {
      const isCustom = tone === "Custom";
      const { request_id } = await submitTTS({
        text: script,
        preset: isCustom ? "default" : tone.toLowerCase(),
        voice_name: voiceId || undefined,
        output_format: format,
        mp3_bitrate: format === "mp3" ? parseInt(mp3Quality, 10) : undefined,
        wav_bit_depth: format === "wav" ? wavQuality : undefined,
        ...(isCustom ? {
          exaggeration: advanced.exaggeration,
          cfg_weight: advanced.cfg,
          temperature: advanced.temperature,
          repetition_penalty: advanced.repetition,
          top_p: advanced.topP,
          min_p: advanced.minP,
        } : {}),
      });

      setGenState({ phase: "polling", requestId: request_id });

      while (!abortRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
        if (abortRef.current) break;
        const job = await getJob(request_id);
        if (job.status === "completed") {
          const blob = await getJobAudio(request_id);
          const url = URL.createObjectURL(blob);
          setGenState({ phase: "done", result: { job, blob, url } });
          queryClient.invalidateQueries({ queryKey: ["jobs"] });
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "Generation failed");
        }
      }
    } catch (err) {
      if (!abortRef.current) {
        setGenState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }
  };

  const genResult = genState.phase === "done" ? genState.result : null;

  const sortedJobs = useMemo(() => {
    const completed = (jobsData ?? []).filter((j) => j.status === "completed");
    return outputSort === "asc" ? [...completed].reverse() : completed;
  }, [jobsData, outputSort]);

  const filteredJobs = useMemo(() => {
    // Exclude the job currently shown in the Output card — it lives there, not here
    const currentId = genResult?.job.request_id;
    let jobs = currentId ? sortedJobs.filter((j) => j.request_id !== currentId) : sortedJobs;
    if (!filterQuery.trim()) return jobs;
    const q = filterQuery.toLowerCase();
    return jobs.filter(
      (j) =>
        (j.voice_name ?? "generic").toLowerCase().includes(q) ||
        j.text.slice(0, 120).toLowerCase().includes(q) ||
        j.preset.toLowerCase().includes(q) ||
        j.output_format.toLowerCase().includes(q),
    );
  }, [sortedJobs, filterQuery, genResult]);

  const handleToneSelect = (t: string) => {
    setTone(t);
    setSavePresetOpen(false);
    if (t === "Custom") return; // keep current slider values as starting point
    const key = toneKeyMap[t];
    const preset = key && presetsData ? presetsData[key] : null;
    if (preset) setAdvanced(presetToAdvanced(preset as Record<string, number>));
  };

  const handleEditPresetOpen = () => {
    setEditPresetNameInput(tone);
    setEditPresetError("");
    setEditPresetOpen(true);
  };

  const handleEditPreset = async () => {
    const newName = editPresetNameInput.trim();
    if (!newName) { setEditPresetError("Name is required."); return; }
    const oldKey = toneKeyMap[tone];
    setEditingPreset(true);
    setEditPresetError("");
    try {
      await savePreset(newName, {
        temperature: advanced.temperature,
        exaggeration: advanced.exaggeration,
        cfg_weight: advanced.cfg,
        repetition_penalty: advanced.repetition,
        top_p: advanced.topP,
        min_p: advanced.minP,
      });
      // If renamed, remove the old key
      if (newName !== tone && oldKey && newName.toLowerCase() !== oldKey) {
        await deletePreset(oldKey);
      }
      await queryClient.invalidateQueries({ queryKey: ["presets"] });
      setTone(newName);
      setEditPresetOpen(false);
    } catch (err) {
      setEditPresetError(err instanceof Error ? err.message : "Failed to update preset.");
    } finally {
      setEditingPreset(false);
    }
  };

  const [removingPreset, setRemovingPreset] = useState(false);
  const handleRemovePreset = async () => {
    const key = toneKeyMap[tone];
    if (!key) return;
    setRemovingPreset(true);
    try {
      await deletePreset(key);
      await queryClient.invalidateQueries({ queryKey: ["presets"] });
      setTone("Default");
      setAdvanced(ADVANCED_DEFAULTS);
    } catch {
      // preset may already be gone; still reset
      setTone("Default");
    } finally {
      setRemovingPreset(false);
    }
  };

  const handleSavePreset = async () => {
    const name = presetNameInput.trim();
    if (!name) { setSavePresetError("Name is required."); return; }
    setSavingPreset(true);
    setSavePresetError("");
    try {
      await savePreset(name, {
        temperature: advanced.temperature,
        exaggeration: advanced.exaggeration,
        cfg_weight: advanced.cfg,
        repetition_penalty: advanced.repetition,
        top_p: advanced.topP,
        min_p: advanced.minP,
      });
      await queryClient.invalidateQueries({ queryKey: ["presets"] });
      setTone(name);
      setSavePresetOpen(false);
      setPresetNameInput("");
    } catch (err) {
      setSavePresetError(err instanceof Error ? err.message : "Failed to save preset.");
    } finally {
      setSavingPreset(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* LEFT: Script + Output */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* Script card */}
        <section className="rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-foreground">Script</h2>
            <div className="flex items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".txt,.md,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setScript(text.slice(0, max));
                  e.currentTarget.value = "";
                }}
              />
              <button
                onClick={() => importInputRef.current?.click()}
                className="group inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition-all hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
                  boxShadow:
                    "0 6px 14px -6px oklch(0.55 0.22 260 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.25)",
                }}
              >
                <Upload className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
                Import
              </button>
              <button
                onClick={() => setScript("")}
                disabled={!script.length}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-foreground/70 transition-all hover:border-[oklch(0.62_0.2_25/0.4)] hover:bg-[oklch(0.98_0.02_25)] hover:text-[oklch(0.55_0.22_25)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-white disabled:hover:text-foreground/70"
              >
                <Trash2 className="h-3.5 w-3.5 transition-transform group-hover:rotate-6 group-disabled:group-hover:rotate-0" />
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value.slice(0, max))}
              onClick={(e) => { if (script === SAMPLE_SCRIPT) (e.target as HTMLTextAreaElement).select(); }}
              placeholder="Type or paste your script..."
              className="h-[360px] w-full resize-none rounded-xl border border-border bg-[oklch(0.99_0.003_260)] px-5 py-4 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/35 focus:border-[oklch(0.55_0.22_260)] focus:outline-none focus:ring-4 focus:ring-[oklch(0.55_0.22_260)/0.08]"
            />
            <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
              <span>
                {script.length.toLocaleString()} / {max.toLocaleString()} characters
              </span>
              <span className="inline-flex items-center gap-1">
                Est. {Math.max(0, Math.round(script.length / 14))} sec
                <InfoTip text="Rough estimate of audio length based on ~14 characters per second of speech. Actual duration varies with tone, pace, and pauses in the final render." />
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-nowrap items-center gap-2">
            <button
              disabled
              title="Coming soon"
              className="inline-flex min-w-0 shrink cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-2 text-[13px] font-medium text-muted-foreground sm:gap-2 sm:px-3"
            >
              <Pause className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Insert Pause</span>
              <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 md:inline">
                Soon
              </span>
            </button>
            <button
              disabled
              title="Coming soon"
              className="inline-flex min-w-0 shrink cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-2 text-[13px] font-medium text-muted-foreground sm:gap-2 sm:px-3"
            >
              <span className="truncate">
                <span className="sm:hidden">Pronunciation</span>
                <span className="hidden sm:inline">Add Pronunciation</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 md:inline">
                Soon
              </span>
            </button>
            <button
              disabled
              title="Keyboard shortcuts — coming soon"
              aria-label="Keyboard shortcuts (coming soon)"
              className="ml-auto flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground"
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>

          {genState.phase === "error" && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[oklch(0.62_0.2_25/0.3)] bg-[oklch(0.98_0.02_25)] px-4 py-3 text-[13px] text-[oklch(0.45_0.2_25)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{genState.message}</span>
              <button onClick={() => setGenState({ phase: "idle" })} className="shrink-0 opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !script.trim()}
            className="group mt-5 flex w-full items-center justify-center gap-3 rounded-xl px-6 py-4 text-[15px] font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:brightness-100"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
              boxShadow:
                "0 18px 36px -14px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {genState.phase === "submitting" ? "Processing Script…" : `Processing Script… ${fmtTime(elapsed)}`}
              </>
            ) : (
              <>
                <AudioLines className="h-5 w-5" />
                Generate Voice
                <Sparkles className="h-4 w-4 opacity-80" />
              </>
            )}
          </button>
        </section>

        {/* Output card — current generation only */}
        <section className={`rounded-2xl border bg-white p-6 transition-colors duration-500 ${genResult && !isGenerating ? "border-[oklch(0.78_0.14_145)]" : "border-border"}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-foreground">Result</h2>
            {genResult && !isGenerating && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(0.96_0.08_145)] px-3 py-1 text-[12px] font-semibold text-[oklch(0.38_0.14_145)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ready
              </span>
            )}
          </div>
          <div className="mt-4">
            {isGenerating ? (
              <GeneratingRow elapsed={elapsed} />
            ) : genResult ? (
              <JobRow
                job={genResult.job}
                preloadedUrl={genResult.url}
                activePlayerId={activePlayerId}
                onActivate={setActivePlayerId}
                onRegenerate={handleGenerate}
              />
            ) : (
              <EmptyOutputState />
            )}
          </div>
        </section>

        {/* History card — previous recordings */}
        <section className="rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-foreground">Recent</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOutputSort((s) => (s === "desc" ? "asc" : "desc"))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${outputSort === "asc" ? "border-[oklch(0.55_0.22_260/0.3)] bg-[oklch(0.97_0.02_260)] text-[oklch(0.45_0.22_260)]" : "border-border bg-white text-foreground/80 hover:bg-muted"}`}
              >
                {outputSort === "desc" ? "Newest First" : "Oldest First"}
                <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
              </button>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${filterOpen ? "border-[oklch(0.55_0.22_260/0.3)] bg-[oklch(0.97_0.02_260)] text-[oklch(0.45_0.22_260)]" : "border-border bg-white text-foreground/80 hover:bg-muted"}`}
              >
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {filterOpen && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-[oklch(0.99_0.003_260)] px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                <input
                  autoFocus
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter by voice, preset, format, or text…"
                  className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/35"
                />
                {filterQuery && (
                  <button onClick={() => setFilterQuery("")} className="shrink-0 text-foreground/40 hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-[oklch(0.99_0.003_260)] py-8 text-center">
                <AudioLines className="h-7 w-7 text-foreground/20" />
                <p className="text-[13px] font-medium text-foreground/40">No recordings yet</p>
                <p className="text-[12px] text-foreground/30">Generated files will appear here</p>
              </div>
            ) : (
              <>
                {filteredJobs.slice(0, visibleCount).map((job) => (
                  <JobRow
                    key={job.request_id}
                    job={job}
                    preloadedUrl={genResult?.job.request_id === job.request_id ? genResult.url : undefined}
                    activePlayerId={activePlayerId}
                    onActivate={setActivePlayerId}
                    onRegenerate={() => setScript(job.text)}
                    onDelete={async () => {
                      await deleteJob(job.request_id).catch(() => {});
                      queryClient.invalidateQueries({ queryKey: ["jobs"] });
                    }}
                  />
                ))}
                {filteredJobs.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount((n) => n + 3)}
                    className="w-full rounded-xl border border-dashed border-border py-3 text-[13px] font-medium text-foreground/50 transition-colors hover:border-[oklch(0.55_0.22_260/0.4)] hover:bg-[oklch(0.98_0.01_260)] hover:text-[oklch(0.45_0.22_260)]"
                  >
                    Load {Math.min(3, filteredJobs.length - visibleCount)} more
                    <span className="ml-1.5 text-foreground/35">({filteredJobs.length - visibleCount} remaining)</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-[12px] text-foreground/65">
            <span>{filteredJobs.length} recording{filteredJobs.length !== 1 ? "s" : ""}</span>
            <a className="inline-flex items-center gap-1 font-semibold text-[oklch(0.55_0.22_260)] hover:underline" href="/app/recordings">
              View All Recordings <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>
      </div>

      {/* RIGHT: Voice Studio + side cards */}
      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-[18px] font-bold text-foreground">Voice Studio</h2>

          <div className="mt-5">
            <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
              Voice Profile <InfoTip text="Choose the voice persona used for generation. Each profile has a unique timbre, accent, and delivery style — e.g. 'Aurora' for warm narration, 'Vox' for crisp announcements." />
            </label>
            <div className="relative mt-2">
              <button
                data-voice-picker-trigger
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 text-left transition-all hover:border-[oklch(0.55_0.22_260/0.4)] hover:bg-[oklch(0.99_0.01_260)]"
              >
                <VoiceIcon voice={selectedVoice} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-bold text-foreground">{selectedVoice.displayName}</span>
                    {selectedVoice.isFavorite && (
                      <Star className="h-3 w-3 shrink-0 fill-[oklch(0.78_0.16_75)] text-[oklch(0.78_0.16_75)]" />
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {selectedVoice.tags.map((t) => (
                      <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground/65">
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
                <ChevronDown
                  className={
                    "h-4 w-4 shrink-0 text-foreground/50 transition-transform " +
                    (pickerOpen ? "rotate-180" : "")
                  }
                />
              </button>

              {pickerOpen && (
                <VoicePicker
                  voices={displayVoices}
                  selectedId={voiceId}
                  favorites={favorites}
                  onSelect={(id) => {
                    setVoiceId(id);
                    setPickerOpen(false);
                  }}
                  onToggleFavorite={toggleFavorite}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
            <VoicePreviewPlayer voiceId={voiceId} />
          </div>

          <div className="mt-5">
            <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
              Tone / Style <InfoTip text="Sets the emotional delivery and pacing. 'Neutral' reads flat and even; 'Cheerful' adds lift and energy; 'Serious' slows the pace for weight and authority." />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tones.map((t) => {
                const active = t === tone;
                const isUser = t !== "Custom" && !!toneKeyMap[t] && !BUILTIN_PRESET_KEYS.has(toneKeyMap[t]);
                return (
                  <button
                    key={t}
                    onClick={() => handleToneSelect(t)}
                    className={
                      active
                        ? "inline-flex items-center gap-1 rounded-md bg-[oklch(0.55_0.22_260)] px-2.5 py-1.5 text-[12px] font-bold text-white"
                        : "inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-foreground/75 transition-colors hover:bg-muted"
                    }
                  >
                    {isUser && <Sparkles className="h-2.5 w-2.5 opacity-70" />}
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
              Output Format <InfoTip text="Choose the audio file type. MP3 is compressed and small — great for sharing and web playback. WAV is uncompressed 16-bit PCM — best for editing or archival quality." />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <FormatTile active={format === "mp3"} onClick={() => setFormat("mp3")} title="MP3" subtitle={`${mp3Quality} kbps`} />
              <FormatTile active={format === "wav"} onClick={() => setFormat("wav")} title="WAV" subtitle={WAV_PRESETS.find((p) => p.id === wavQuality)?.short ?? "16-bit · 24k"} />
            </div>
          </div>



          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-border bg-white px-3 py-2.5 text-[13px] font-medium text-foreground/80 transition-colors hover:bg-muted"
          >
            <span className="inline-flex items-center gap-2">
              Advanced Settings
              {isDirty && (
                <span className="rounded-full bg-[oklch(0.55_0.22_260)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  Modified
                </span>
              )}
            </span>
            <ChevronDown
              className={
                "h-4 w-4 text-foreground/50 transition-transform " +
                (advancedOpen ? "rotate-180" : "")
              }
            />
          </button>

          {advancedOpen && (
            <div
              className="mt-3 rounded-xl border border-border bg-[oklch(0.99_0.003_260)] p-4"
              style={{
                boxShadow:
                  "inset 0 1px 0 oklch(1 0 0 / 0.6), 0 1px 2px oklch(0.16 0.02 260 / 0.04)",
              }}
            >
              <div className="mb-4 border-b border-border pb-4">
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground/70">
                    {format === "mp3" ? "MP3 Bitrate" : "WAV Bit Depth"}
                    <InfoTip text={format === "mp3"
                      ? "Higher bitrate = better fidelity and larger file. 128 kbps is ideal for spoken word; 192–320 kbps for music-like content."
                      : "All WAV output is 24 kHz mono (native model rate). Higher bit depth adds fidelity for post-production but the difference is subtle for voice."} />
                  </label>
                  <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    {format}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {(format === "mp3" ? MP3_PRESETS : WAV_PRESETS).map((p) => {
                    const active = format === "mp3" ? mp3Quality === p.id : wavQuality === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() =>
                          format === "mp3" ? setMp3Quality(p.id) : setWavQuality(p.id)
                        }
                        className={
                          "flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-all " +
                          (active
                            ? "border-[oklch(0.55_0.22_260)] bg-[oklch(0.96_0.04_260)] text-[oklch(0.45_0.22_260)] shadow-[inset_0_0_0_1px_oklch(0.55_0.22_260/0.25)]"
                            : "border-border bg-white text-foreground/75 hover:bg-muted")
                        }
                      >
                        <span className="text-[12px] font-bold tabular-nums">{p.label}</span>
                        <span className="text-[10.5px] font-normal text-muted-foreground">
                          {p.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {ADVANCED_FIELDS.map((f) => (
                  <AdvancedSlider
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={advanced[f.key]}
                    onChange={(v) => setAdvanced((s) => ({ ...s, [f.key]: v }))}
                  />
                ))}
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <div className="flex items-center justify-end gap-2">
                  {isUserPreset ? (
                    /* User preset: Edit + Remove */
                    <>
                      <button
                        onClick={handleEditPresetOpen}
                        className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/70 transition-all hover:border-[oklch(0.55_0.22_260/0.4)] hover:bg-[oklch(0.98_0.02_260)] hover:text-[oklch(0.45_0.22_260)]"
                      >
                        <Pencil className="h-3.5 w-3.5 transition-transform group-hover:-rotate-6" />
                        Edit
                      </button>
                      <button
                        onClick={handleRemovePreset}
                        disabled={removingPreset}
                        className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/70 transition-all hover:border-[oklch(0.62_0.2_25/0.4)] hover:bg-[oklch(0.98_0.02_25)] hover:text-[oklch(0.55_0.22_25)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {removingPreset
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5 transition-transform group-hover:rotate-6" />}
                        Remove
                      </button>
                    </>
                  ) : (
                    /* Built-in preset or Custom: Reset to defaults */
                    <button
                      onClick={() => setAdvanced(ADVANCED_DEFAULTS)}
                      disabled={!isDirty}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/75 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reset to Default
                    </button>
                  )}

                  {/* Save Preset: only visible when in Custom mode */}
                  {tone === "Custom" && (
                    <button
                      onClick={() => { setSavePresetOpen((v) => !v); setSavePresetError(""); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110"
                      style={{ boxShadow: "0 10px 20px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)" }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Save Preset
                    </button>
                  )}
                </div>

                {/* Edit panel for user presets */}
                {isUserPreset && editPresetOpen && (
                  <div className="mt-3 rounded-xl border border-[oklch(0.55_0.22_260/0.25)] bg-[oklch(0.97_0.025_260)] p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-foreground/70">
                      Rename or update settings — current slider values will be saved.
                    </p>
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={editPresetNameInput}
                        onChange={(e) => { setEditPresetNameInput(e.target.value); setEditPresetError(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleEditPreset(); if (e.key === "Escape") setEditPresetOpen(false); }}
                        placeholder="Preset name"
                        maxLength={40}
                        className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-[12px] outline-none focus:border-[oklch(0.55_0.22_260)] focus:ring-2 focus:ring-[oklch(0.55_0.22_260/0.12)]"
                      />
                      <button
                        onClick={handleEditPreset}
                        disabled={editingPreset || !editPresetNameInput.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
                      >
                        {editingPreset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Update
                      </button>
                      <button
                        onClick={() => setEditPresetOpen(false)}
                        className="rounded-lg border border-border bg-white px-2 py-2 text-foreground/60 hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editPresetError && (
                      <p className="mt-1.5 text-[11px] text-[oklch(0.5_0.2_25)]">{editPresetError}</p>
                    )}
                  </div>
                )}

                {tone === "Custom" && savePresetOpen && (
                  <div className="mt-3 rounded-xl border border-[oklch(0.55_0.22_260/0.25)] bg-[oklch(0.97_0.025_260)] p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-foreground/70">
                      Name this preset — it will appear in the Tone chips above.
                    </p>
                    {(() => {
                      const trimmed = presetNameInput.trim();
                      const allPresetKeys = presetsData ? Object.keys(presetsData) : [];
                      const collision = trimmed
                        ? allPresetKeys.find((k) => k.toLowerCase() === trimmed.toLowerCase())
                        : undefined;
                      const isBuiltin = trimmed && ["default","youtube","hype","news"].includes(trimmed.toLowerCase());
                      const nameError = isBuiltin
                        ? `'${trimmed}' is a built-in preset and cannot be overwritten.`
                        : collision
                        ? `A preset named '${collision}' already exists.`
                        : null;
                      return (
                        <div className="flex flex-col gap-2">
                          <input
                            autoFocus
                            value={presetNameInput}
                            onChange={(e) => { setPresetNameInput(e.target.value); setSavePresetError(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); if (e.key === "Escape") setSavePresetOpen(false); }}
                            placeholder="e.g. My Deep Voice"
                            maxLength={40}
                            className={`w-full rounded-lg border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 ${nameError ? "border-[oklch(0.7_0.2_25)] focus:border-[oklch(0.6_0.2_25)] focus:ring-[oklch(0.6_0.2_25/0.12)]" : "border-border focus:border-[oklch(0.55_0.22_260)] focus:ring-[oklch(0.55_0.22_260/0.12)]"}`}
                          />
                          {nameError && (
                            <p className="text-[11px] text-[oklch(0.5_0.2_25)]">{nameError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleSavePreset}
                              disabled={savingPreset || !trimmed || !!nameError}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
                            >
                              {savingPreset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Save
                            </button>
                            <button
                              onClick={() => setSavePresetOpen(false)}
                              className="rounded-lg border border-border bg-white px-3 py-2 text-[12px] text-foreground/60 hover:bg-muted"
                            >
                              Cancel
                            </button>
                          </div>
                          {savePresetError && (
                            <p className="text-[11px] text-[oklch(0.5_0.2_25)]">{savePresetError}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

      </aside>
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex">
      <Info className="h-3 w-3 cursor-help opacity-60 transition-opacity group-hover/tip:opacity-100" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-60 -translate-x-1/2 rounded-lg border border-border bg-white px-3 py-2 text-[11px] font-medium leading-snug text-foreground/80 opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100"
        style={{ boxShadow: "0 6px 24px oklch(0.16 0.02 260 / 0.12)" }}
      >
        {text}
      </span>
    </span>
  );
}

function VoiceIcon({ voice, size = "md" }: { voice: Voice; size?: "md" | "lg" }) {
  const sz = size === "lg" ? "h-10 w-10" : "h-9 w-9";
  const textSz = size === "lg" ? "text-[15px]" : "text-[13px]";

  if (voice.iconData) {
    return (
      <span className={`${sz} shrink-0 overflow-hidden rounded-full border border-border`}>
        <img src={voice.iconData} alt={voice.displayName} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={`flex ${sz} shrink-0 items-center justify-center rounded-full ${textSz} font-black text-white`}
      style={{ background: ACCENT_BG[voice.accent] }}
    >
      {voice.displayName[0]?.toUpperCase() ?? <Disc3 className="h-4 w-4" strokeWidth={2} />}
    </span>
  );
}

function VoicePicker({
  voices,
  selectedId,
  favorites,
  onSelect,
  onToggleFavorite,
  onClose,
}: {
  voices: Voice[];
  selectedId: string;
  favorites: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof VOICE_FILTERS)[number]>("All");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        if ((e.target as HTMLElement).closest?.("[data-voice-picker-trigger]")) return;
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      clearTimeout(t);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = voices.filter((v) => {
      if (filter !== "All" && v.category !== filter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.tags.some((t) => t.toLowerCase().includes(q)) ||
        v.category.toLowerCase().includes(q)
      );
    });
    return matches.sort((a, b) => {
      const af = favorites.includes(a.id) ? 0 : 1;
      const bf = favorites.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    });
  }, [voices, filter, query, favorites]);

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-border bg-white"
      style={{
        boxShadow:
          "0 24px 48px -16px oklch(0.16 0.02 260 / 0.18), 0 4px 12px -4px oklch(0.16 0.02 260 / 0.08)",
      }}
    >
      <div className="border-b border-border p-3">
        <div className="flex items-center rounded-lg border border-border bg-[oklch(0.99_0.003_260)] px-3 py-2 focus-within:border-[oklch(0.55_0.22_260)] focus-within:ring-4 focus-within:ring-[oklch(0.55_0.22_260/0.08)]">
          <Search className="h-3.5 w-3.5 text-foreground/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search voices by name or tag..."
            className="ml-2 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-foreground/40 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {VOICE_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  active
                    ? "rounded-md bg-[oklch(0.55_0.22_260)] px-2 py-1 text-[11px] font-bold text-white"
                    : "rounded-md border border-border bg-white px-2 py-1 text-[11px] font-semibold text-foreground/70 transition-colors hover:bg-muted"
                }
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[340px] overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-foreground/50">
            No voices match "{query}"
          </div>
        ) : (
          filtered.map((v) => {
            const isSelected = v.id === selectedId;
            const isFav = favorites.includes(v.id);
            return (
              <div
                key={v.id}
                className={
                  "group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors " +
                  (isSelected ? "bg-[oklch(0.97_0.025_260)]" : "hover:bg-muted")
                }
              >
                <button
                  onClick={() => onSelect(v.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <VoiceIcon voice={v} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={
                          "truncate text-[13px] " +
                          (isSelected
                            ? "font-bold text-[oklch(0.55_0.22_260)]"
                            : "font-semibold text-foreground")
                        }
                      >
                        {v.displayName}
                      </span>
                      <span className="rounded bg-muted px-1 py-px text-[9px] font-bold uppercase tracking-wide text-foreground/55">
                        {v.category}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5">
                      {v.tags.map((t) => (
                        <span key={t} className="text-[10.5px] text-foreground/55">
                          {t}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(v.id);
                  }}
                  aria-label={isFav ? "Unfavorite" : "Favorite"}
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors " +
                    (isFav
                      ? "text-[oklch(0.78_0.16_75)]"
                      : "text-foreground/30 opacity-0 hover:text-foreground/70 group-hover:opacity-100")
                  }
                >
                  <Star className={"h-4 w-4 " + (isFav ? "fill-current" : "")} />
                </button>
                {isSelected && (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[oklch(0.55_0.22_260)] text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <a
        href="/app/library"
        className="flex items-center justify-between border-t border-border bg-[oklch(0.99_0.003_260)] px-4 py-3 text-[12px] font-semibold text-[oklch(0.55_0.22_260)] transition-colors hover:bg-[oklch(0.97_0.025_260)]"
      >
        <span className="inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Record or import a new voice
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function FormatTile({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  const isMp3 = title === "MP3";
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={
        "group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-all " +
        (active
          ? "text-white"
          : "border border-border bg-white text-foreground hover:-translate-y-0.5 hover:border-[oklch(0.55_0.22_260/0.35)] hover:shadow-[0_8px_18px_-12px_oklch(0.55_0.22_260/0.35)]")
      }
      style={
        active
          ? {
              background:
                "linear-gradient(135deg, oklch(0.6 0.2 260), oklch(0.5 0.22 270))",
              boxShadow:
                "0 10px 22px -10px oklch(0.55 0.22 260 / 0.55), inset 0 1px 0 oklch(1 0 0 / 0.25)",
            }
          : undefined
      }
    >
      <span
        className={
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors " +
          (active
            ? "bg-white/15 text-white ring-1 ring-inset ring-white/25"
            : "bg-[oklch(0.96_0.02_260)] text-[oklch(0.55_0.22_260)] group-hover:bg-[oklch(0.94_0.04_260)]")
        }
      >
        {isMp3 ? <AudioLines className="h-4 w-4" /> : <Disc3 className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            "flex items-center gap-1.5 text-[13px] font-bold " +
            (active ? "text-white" : "text-foreground")
          }
        >
          {title}
          {active && (
            <Check
              className="h-3.5 w-3.5 text-white/90"
              strokeWidth={3}
            />
          )}
        </span>
        <span
          className={
            "mt-0.5 block text-[11px] tabular-nums " +
            (active ? "text-white/80" : "text-muted-foreground")
          }
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function AdvancedSlider({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const decimals = step < 0.1 ? 2 : step < 1 ? 2 : 0;
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)_56px] items-center gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-foreground">{label}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-foreground/55">{hint}</div>
      </div>
      <div className="relative flex h-6 items-center">
        <div className="relative h-1 w-full rounded-full bg-muted">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-[oklch(0.55_0.22_260)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[oklch(0.55_0.22_260)] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[oklch(0.55_0.22_260)] [&::-moz-range-thumb]:bg-white"
        />
      </div>
      <div className="rounded-md border border-border bg-white px-2 py-1 text-center text-[12px] font-semibold tabular-nums text-foreground">
        {value.toFixed(decimals)}
      </div>
    </div>
  );
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function GeneratingRow({ elapsed }: { elapsed: number }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-[oklch(0.99_0.003_260)] p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[oklch(0.96_0.04_260)]">
        <Loader2 className="h-5 w-5 animate-spin text-[oklch(0.55_0.22_260)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-foreground">Generating audio…</div>
        <div className="mt-0.5 text-[12px] text-foreground/55">Running on-device · {fmtTime(elapsed)} elapsed</div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[oklch(0.55_0.22_260)]"
            style={{ width: `${Math.min(95, (elapsed / 60) * 100)}%`, transition: "width 0.5s linear" }}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyOutputState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-[oklch(0.99_0.003_260)] py-10 text-center">
      <AudioLines className="h-8 w-8 text-foreground/20" />
      <p className="text-[13px] font-medium text-foreground/40">Your result will appear here</p>
      <p className="text-[12px] text-foreground/30">Generated audio will appear here</p>
    </div>
  );
}

function JobRow({
  job,
  preloadedUrl,
  activePlayerId,
  onActivate,
  onRegenerate,
  onDelete,
}: {
  job: Job;
  preloadedUrl?: string;
  activePlayerId: string | null;
  onActivate: (id: string | null) => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const initialStatus = preloadedUrl ? "ready" : job.file_available === false ? "expired" : "idle";
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "ready" | "expired">(initialStatus);
  const [blobUrl, setBlobUrl] = useState<string | undefined>(preloadedUrl);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [speed, setSpeed] = useState<number>(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);
  const [muted, setMuted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (preloadedUrl && fetchStatus !== "ready") {
      setBlobUrl(preloadedUrl);
      setFetchStatus("ready");
    }
  }, [preloadedUrl]);

  // Pause when another player becomes active
  useEffect(() => {
    if (activePlayerId !== job.request_id && playing) {
      setPlaying(false);
    }
  }, [activePlayerId, job.request_id]);

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

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const handlePlayClick = async () => {
    if (fetchStatus === "loading") return;
    if (fetchStatus === "idle") {
      onActivate(job.request_id);
      setFetchStatus("loading");
      try {
        const blob = await getJobAudio(job.request_id);
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setFetchStatus("ready");
        setTimeout(() => setPlaying(true), 50);
      } catch {
        setFetchStatus("expired");
        onActivate(null);
      }
      return;
    }
    if (fetchStatus === "ready") {
      const next = !playing;
      setPlaying(next);
      onActivate(next ? job.request_id : null);
    }
  };

  const handleCopyScript = async () => {
    await navigator.clipboard.writeText(job.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const audioDuration = duration || (job.audio_duration_s ?? 0);
  const progressPct = audioDuration > 0 ? (progress / audioDuration) * 100 : 0;
  const titlePreview = job.text.slice(0, 48) + (job.text.length > 48 ? "…" : "");
  const voiceLabel = job.voice_name ?? "Generic";
  const presetLabel = job.preset.charAt(0).toUpperCase() + job.preset.slice(1);
  const formatLabel = job.output_format.toUpperCase();
  const ts = new Date(job.completed_at ?? job.created_at);
  const isToday = ts.toDateString() === new Date().toDateString();
  const timeLabel = isToday
    ? `Today, ${ts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : ts.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="rounded-xl border border-border bg-[oklch(0.99_0.003_260)] p-4">
      {blobUrl && <audio ref={audioRef} src={blobUrl} preload="auto" />}

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
        <button
          onClick={handlePlayClick}
          disabled={fetchStatus === "expired"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[oklch(0.95_0.04_260)] text-[oklch(0.55_0.22_260)] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label={playing ? "Pause" : "Play"}
        >
          {fetchStatus === "loading"
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : playing
              ? <Pause className="h-4 w-4" fill="currentColor" />
              : <Play className="h-4 w-4" fill="currentColor" />}
        </button>
        <div className="min-w-0">
          <div className={`truncate text-[14px] font-bold ${fetchStatus === "expired" ? "text-foreground/45" : "text-foreground"}`}>{titlePreview}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-foreground/45">
            {voiceLabel} · {presetLabel} · {formatLabel} · {timeLabel}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-foreground/65 sm:hidden">
            {audioDuration > 0 && <span className="rounded-md bg-muted px-2 py-0.5 font-semibold">{fmtTime(audioDuration)}</span>}
            {job.rtf != null && <span className="rounded-md bg-muted px-2 py-0.5 font-semibold">RTF {job.rtf.toFixed(2)}x</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11.5px] text-foreground/65">
          {audioDuration > 0 && <span className="hidden rounded-md bg-muted px-2 py-1 font-semibold sm:inline">{fmtTime(audioDuration)}</span>}
          {job.rtf != null && <span className="hidden rounded-md bg-muted px-2 py-1 font-semibold sm:inline">RTF {job.rtf.toFixed(2)}x</span>}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded p-1 hover:bg-muted"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-36 overflow-hidden rounded-xl border border-border bg-white shadow-[0_8px_24px_-8px_oklch(0.16_0.02_260/0.18)]">
                <a
                  href={`/jobs/${encodeURIComponent(job.request_id)}/audio`}
                  download={`vox-${job.request_id.slice(0, 8)}.${job.output_format}`}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted ${!job.file_available ? "pointer-events-none opacity-40" : ""}`}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  Download
                </a>
                <div className="h-px bg-border" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-[oklch(0.5_0.2_25)] transition-colors hover:bg-[oklch(0.97_0.02_25)]"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {fetchStatus === "ready" && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <BigWaveform progress={progressPct} />
            <div className="flex shrink-0 flex-col items-end gap-1 text-[12px] text-foreground/65">
              <a
                href={`/jobs/${encodeURIComponent(job.request_id)}/audio`}
                download={`vox-${job.request_id.slice(0, 8)}.${job.output_format}`}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
              {onRegenerate && (
                <button onClick={onRegenerate} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute" : "Mute"}
              className="flex shrink-0 items-center gap-1 text-foreground/55 hover:text-foreground"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume}
              onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
              aria-label="Volume"
              className="w-20 h-1 cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, oklch(0.55 0.22 260) 0%, oklch(0.55 0.22 260) ${(muted ? 0 : volume) * 100}%, oklch(0.6 0.01 260) ${(muted ? 0 : volume) * 100}%, oklch(0.6 0.01 260) 100%)`,
              }}
            />
            <input
              type="range" min={0} max={audioDuration || 1} step={0.1} value={progress}
              onChange={(e) => {
                const v = Number(e.target.value);
                setProgress(v);
                if (audioRef.current) audioRef.current.currentTime = v;
              }}
              aria-label="Seek"
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, oklch(0.55 0.22 260) 0%, oklch(0.55 0.22 260) ${progressPct}%, oklch(0.6 0.01 260) ${progressPct}%, oklch(0.6 0.01 260) 100%)`,
              }}
            />
            <SpeedControl value={speed} onChange={setSpeed} />
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-foreground/55">
              {fmtTime(progress)} <span className="text-foreground/35">/ {fmtTime(audioDuration)}</span>
            </span>
          </div>
        </>
      )}

      {fetchStatus === "expired" && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-[oklch(0.82_0.08_40)] bg-[oklch(0.98_0.02_40)] px-3 py-2.5">
          <div className="flex-1 text-[12px] text-[oklch(0.52_0.12_40)]">
            File expired — audio no longer available on disk
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleCopyScript}
              className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(0.82_0.08_40)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[oklch(0.45_0.12_40)] transition-colors hover:bg-[oklch(0.96_0.04_40)]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Keyboard className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Script"}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(0.75_0.15_260)] bg-[oklch(0.55_0.22_260)] px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:brightness-110"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
          </div>
        </div>
      )}

      {fetchStatus === "idle" && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-12 min-w-0 flex-1 items-center gap-[2px] opacity-25">
            <BigWaveform progress={0} />
          </div>
          {onRegenerate && (
            <div className="flex shrink-0 flex-col items-end gap-1 text-[12px] text-foreground/65">
              <button onClick={onRegenerate} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function BigWaveform({ progress }: { progress: number }) {
  const bars = Array.from({ length: 48 }, (_, i) =>
    Math.abs(Math.sin(i * 0.35) * 0.6 + Math.cos(i * 0.13) * 0.4) * 0.9 + 0.08,
  );
  const playedIdx = Math.floor((progress / 100) * bars.length);
  return (
    <div className="flex h-12 min-w-0 flex-1 items-center gap-[2px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className="h-full min-w-[2px] flex-1 rounded-full transition-colors"
          style={{
            background: i <= playedIdx ? "oklch(0.55 0.22 260)" : "oklch(0.82 0.04 260)",
            transform: `scaleY(${h})`,
          }}
        />
      ))}
    </div>
  );
}

function VoicePreviewPlayer({ voiceId }: { voiceId: string }) {
  const isGeneric = voiceId === "";
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);

  // Reset player when voice changes
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }, [voiceId]);

  // Wire audio element events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.currentTime);
    const onDur = () => { if (isFinite(a.duration)) setDuration(a.duration); };
    const onEnded = () => { setPlaying(false); setProgress(0); };
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
  }, [voiceId]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || isGeneric) return;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing, isGeneric]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const src = voiceId ? `/voices/${encodeURIComponent(voiceId)}/audio` : "";

  if (isGeneric) {
    return (
      <div className="mt-2.5">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/35">Preview</p>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-2.5 py-2 opacity-50 select-none">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/40">
            <Play className="ml-0.5 h-3.5 w-3.5" />
          </span>
          <span className="w-8 text-center text-[10px] font-mono tabular-nums text-foreground/40">0:00</span>
          <div className="h-1 flex-1 rounded-full bg-foreground/20" />
          <span className="w-8 text-center text-[10px] font-mono tabular-nums text-foreground/40">—:——</span>
          <Volume2 className="h-3.5 w-3.5 text-foreground/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">Preview</p>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-[oklch(0.99_0.003_260)] px-2.5 py-2">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? "Pause preview" : "Play preview"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
        style={{ background: "oklch(0.55 0.22 260)" }}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>

      <span className="w-8 text-center text-[10px] font-mono tabular-nums text-foreground/60">
        {fmtTime(progress)}
      </span>

      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={progress}
        onChange={(e) => {
          const v = Number(e.target.value);
          setProgress(v);
          if (audioRef.current) audioRef.current.currentTime = v;
        }}
        aria-label="Seek"
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, oklch(0.55 0.22 260) 0%, oklch(0.55 0.22 260) ${pct}%, oklch(0.6 0.01 260) ${pct}%, oklch(0.6 0.01 260) 100%)`,
        }}
      />

      <span className="w-8 text-center text-[10px] font-mono tabular-nums text-foreground/60">
        {duration > 0 ? fmtTime(duration) : "—:——"}
      </span>

      <button
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute" : "Mute"}
        className="shrink-0 text-foreground/60 hover:text-foreground"
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
        aria-label="Volume"
        className="w-12 h-1 cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(to right, oklch(0.55 0.22 260) 0%, oklch(0.55 0.22 260) ${(muted ? 0 : volume) * 100}%, oklch(0.6 0.01 260) ${(muted ? 0 : volume) * 100}%, oklch(0.6 0.01 260) 100%)`,
        }}
      />
      </div>
    </div>
  );
}

function SpeedControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const label = `${value}x`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Playback speed ${label}`}
        className={
          "inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-md border px-1.5 text-[11px] font-bold tabular-nums transition-colors " +
          (value === 1
            ? "border-border bg-white text-foreground/70 hover:bg-muted"
            : "border-[oklch(0.85_0.08_260)] bg-[oklch(0.96_0.04_260)] text-[oklch(0.45_0.22_260)] hover:bg-[oklch(0.93_0.05_260)]")
        }
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 flex w-16 flex-col overflow-hidden rounded-lg border border-border bg-white py-1 shadow-lg"
          style={{ boxShadow: "0 6px 24px oklch(0.16 0.02 260 / 0.12)" }}
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={
                "px-2 py-1 text-center text-[11.5px] font-semibold tabular-nums transition-colors " +
                (s === value
                  ? "bg-[oklch(0.96_0.04_260)] text-[oklch(0.45_0.22_260)]"
                  : "text-foreground/75 hover:bg-muted")
              }
            >
              {s}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
