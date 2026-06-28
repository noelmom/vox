import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Gauge,
  History,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ApiVoice, type Job, listVoices, listPresets, listJobs, submitTTS, getJob, getJobAudio, savePreset, deletePreset, deleteJob, cancelJob, patchVoice, parseServerDate } from "@/lib/api";
import { setGenerationState } from "@/lib/generation";
import { tagStyle } from "@/lib/utils";
import { BRAND, BRAND_GRADIENT, BRAND_SECONDARY, BRAND_WARM } from "@/lib/theme";

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
  indigo: BRAND,
  teal: BRAND_SECONDARY,
  amber: "oklch(0.72 0.16 70)",
  rose: "oklch(0.62 0.20 15)",
  violet: "oklch(0.55 0.20 300)",
  slate: "oklch(0.16 0.02 240)",
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

function readScriptHistory(): string[] {
  try {
    const raw = localStorage.getItem(SCRIPT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeScriptHistory(history: string[]) {
  try {
    localStorage.setItem(SCRIPT_HISTORY_KEY, JSON.stringify(history.slice(0, SCRIPT_HISTORY_LIMIT)));
  } catch {}
}

function pushScriptHistory(history: string[], script: string) {
  const value = script.trim();
  if (!value) return history;
  const next = [value, ...history.filter((item) => item !== value)];
  return next.slice(0, SCRIPT_HISTORY_LIMIT);
}

// Built-in preset keys (lowercase) — cannot be removed by the user
const BUILTIN_PRESET_KEYS = new Set(["confident", "calm", "soft-spoken", "polite", "enthusiastic", "dramatic", "angry", "sarcastic", "newsreader", "storyteller", "default"]);

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
  | { phase: "polling"; requestId: string; startedAt: number; status?: "queued" | "processing" }
  | { phase: "done"; result: GenResult }
  | { phase: "error"; message: string; requestId?: string };

const SCRIPT_HISTORY_KEY = "vox:script-history";
const SCRIPT_HISTORY_LIMIT = 10;
const LAST_REQUEST_KEY = "vox:last-generation-request";

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
  const activeRequestRef = useRef<string | null>(null);
  const generationStartedAtRef = useRef<number>(0);
  const [stopping, setStopping] = useState(false);
  const [scriptHistory, setScriptHistory] = useState<string[]>(() => readScriptHistory());
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
  const builtInTones = useMemo(
    () => tones.filter((t) => t !== "Custom" && !!toneKeyMap[t] && BUILTIN_PRESET_KEYS.has(toneKeyMap[t])),
    [tones, toneKeyMap],
  );
  const customTones = useMemo(
    () => tones.filter((t) => t !== "Custom" && !!toneKeyMap[t] && !BUILTIN_PRESET_KEYS.has(toneKeyMap[t])),
    [tones, toneKeyMap],
  );
  const selectedVoice = displayVoices.find((v) => v.id === voiceId) ?? GENERIC_VOICE;
  const currentPresetParams = () => ({
    temperature: advanced.temperature,
    exaggeration: advanced.exaggeration,
    cfg_weight: advanced.cfg,
    repetition_penalty: advanced.repetition,
    top_p: advanced.topP,
    min_p: advanced.minP,
  });
  const activeToneKey = toneKeyMap[tone];
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
    const startedAt = genState.phase === "polling" ? genState.startedAt : generationStartedAtRef.current || Date.now();
    generationStartedAtRef.current = startedAt;
    setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [isGenerating, genState.phase === "polling" ? genState.requestId : null, genState.phase === "polling" ? genState.startedAt : null]);

  useEffect(() => {
    if (genState.phase === "submitting") {
      setGenerationState({ phase: "submitting" });
    } else if (genState.phase === "polling") {
      setGenerationState({
        phase: "polling",
        requestId: genState.requestId,
        startedAt: genState.startedAt,
        status: genState.status,
      });
    } else if (genState.phase === "done") {
      setGenerationState({ phase: "done", requestId: genState.result.job.request_id });
    } else if (genState.phase === "error") {
      setGenerationState({ phase: "error", requestId: genState.requestId, message: genState.message });
    } else {
      setGenerationState({ phase: "idle" });
    }
  }, [genState]);

  useEffect(() => {
    const savedRequestId = localStorage.getItem(LAST_REQUEST_KEY);
    if (!savedRequestId || genState.phase !== "idle") return;
    let cancelled = false;

    (async () => {
      try {
        const job = await getJob(savedRequestId);
        if (cancelled) return;

        if (job.status === "completed") {
          const blob = await getJobAudio(savedRequestId);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setGenState({ phase: "done", result: { job, blob, url } });
          setGenerationState({ phase: "done", requestId: savedRequestId });
          return;
        }

        if (job.status === "queued" || job.status === "processing") {
          generationStartedAtRef.current = parseServerDate(job.created_at).getTime() || Date.now();
          setGenState({ phase: "polling", requestId: savedRequestId, startedAt: generationStartedAtRef.current, status: job.status });
          setGenerationState({
            phase: "polling",
            requestId: savedRequestId,
            startedAt: generationStartedAtRef.current,
            status: job.status,
          });
          return;
        }

        if (job.status === "cancelled") {
          localStorage.removeItem(LAST_REQUEST_KEY);
          setGenerationState({ phase: "cancelled", requestId: savedRequestId });
          return;
        }

        if (job.status === "failed") {
          localStorage.removeItem(LAST_REQUEST_KEY);
          setGenState({ phase: "error", message: job.error ?? "Generation failed", requestId: savedRequestId });
          setGenerationState({ phase: "error", requestId: savedRequestId, message: job.error ?? "Generation failed" });
        }
      } catch {
        localStorage.removeItem(LAST_REQUEST_KEY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [genState.phase]);

  useEffect(() => {
    if (genState.phase !== "polling") return;

    const requestId = genState.requestId;
    activeRequestRef.current = requestId;
    let stopped = false;

    const applyJobUpdate = async (job: Job) => {
      if (stopped) return;

      if (job.status === "queued" || job.status === "processing") {
        const startedAt = genState.startedAt || generationStartedAtRef.current || parseServerDate(job.created_at).getTime() || Date.now();
        generationStartedAtRef.current = startedAt;
        const next: GenState = { phase: "polling", requestId, startedAt, status: job.status };
        setGenState(next);
        setGenerationState(next);
        return;
      }

      if (job.status === "completed") {
        const blob = await getJobAudio(requestId);
        if (stopped) return;
        const url = URL.createObjectURL(blob);
        setGenState({ phase: "done", result: { job, blob, url } });
        setGenerationState({ phase: "done", requestId });
        localStorage.setItem(LAST_REQUEST_KEY, requestId);
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        return;
      }

      if (job.status === "cancelled") {
        setGenState({ phase: "idle" });
        setGenerationState({ phase: "cancelled", requestId });
        localStorage.removeItem(LAST_REQUEST_KEY);
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        return;
      }

      if (job.status === "failed") {
        setGenState({ phase: "error", message: job.error ?? "Generation failed", requestId });
        setGenerationState({ phase: "error", message: job.error ?? "Generation failed", requestId });
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }
    };

    const reconcile = async () => {
      try {
        const job = await getJob(requestId);
        await applyJobUpdate(job);
      } catch (err) {
        if (stopped) return;
        const message = err instanceof Error ? err.message : String(err);
        setGenState({ phase: "error", message, requestId });
        setGenerationState({ phase: "error", message, requestId });
      }
    };

    const source = new EventSource(`/api/v1/jobs/${encodeURIComponent(requestId)}/events`);
    source.addEventListener("job", (event) => {
      void applyJobUpdate(JSON.parse((event as MessageEvent).data) as Job);
    });
    source.addEventListener("deleted", () => {
      if (stopped) return;
      setGenState({ phase: "error", message: "Job was deleted before it finished.", requestId });
      setGenerationState({ phase: "error", message: "Job was deleted before it finished.", requestId });
    });

    reconcile();
    const id = window.setInterval(reconcile, 5000);
    return () => {
      stopped = true;
      source.close();
      window.clearInterval(id);
    };
  }, [genState.phase === "polling" ? genState.requestId : null, queryClient]);

  const handleGenerate = async () => {
    if (!script.trim() || isGenerating) return;
    abortRef.current = false;
    activeRequestRef.current = null;
    setStopping(false);

    // Revoke previous blob URL
    if (genState.phase === "done") URL.revokeObjectURL(genState.result.url);

    generationStartedAtRef.current = Date.now();
    setElapsed(0);
    setGenState({ phase: "submitting" });
    setGenerationState({ phase: "submitting" });
    const nextHistory = pushScriptHistory(scriptHistory, script);
    setScriptHistory(nextHistory);
    writeScriptHistory(nextHistory);

    try {
      const isCustom = tone === "Custom";
      const useOverrides = isCustom || isDirty;
      const { request_id } = await submitTTS({
        text: script,
        preset: isCustom ? "default" : tone.toLowerCase(),
        voice_name: voiceId || undefined,
        output_format: format,
        mp3_bitrate: format === "mp3" ? parseInt(mp3Quality, 10) : undefined,
        wav_bit_depth: format === "wav" ? wavQuality : undefined,
        ...(useOverrides ? currentPresetParams() : {}),
      });

      activeRequestRef.current = request_id;
      localStorage.setItem(LAST_REQUEST_KEY, request_id);
      setGenState({ phase: "polling", requestId: request_id, startedAt: generationStartedAtRef.current, status: "queued" });
      setGenerationState({ phase: "polling", requestId: request_id, startedAt: generationStartedAtRef.current, status: "queued" });
    } catch (err) {
      if (!abortRef.current) {
        const message = err instanceof Error ? err.message : String(err);
        const requestId = err instanceof Error && "requestId" in err ? String((err as Error & { requestId?: string }).requestId ?? "") : undefined;
        setGenState(requestId ? { phase: "error", message, requestId } : { phase: "error", message });
        setGenerationState(requestId ? { phase: "error", message, requestId } : { phase: "error", message });
      }
    } finally {
      if (activeRequestRef.current) {
        activeRequestRef.current = null;
      }
      setStopping(false);
    }
  };

  const handleCancelGeneration = async () => {
    const requestId = activeRequestRef.current ?? (genState.phase === "polling" ? genState.requestId : null);
    if (!requestId || stopping) return;
    setStopping(true);
    abortRef.current = true;
    try {
      await cancelJob(requestId);
      setGenState({ phase: "idle" });
      setGenerationState({ phase: "cancelled", requestId });
      localStorage.removeItem(LAST_REQUEST_KEY);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cancellation failed.";
      setGenState({ phase: "error", message, requestId });
      setGenerationState({ phase: "error", message, requestId });
    } finally {
      setStopping(false);
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

  const openSaveAsPreset = () => {
    const baseName = `${tone} 2`;
    const existing = new Set(Object.keys(presetsData ?? {}).map((k) => k.toLowerCase()));
    let candidate = baseName;
    let suffix = 2;
    while (existing.has(candidate.trim().toLowerCase())) {
      suffix += 1;
      candidate = `${tone} ${suffix}`;
    }
    setPresetNameInput(candidate);
    setSavePresetError("");
    setSavePresetOpen(true);
  };

  const handleUpdatePreset = async () => {
    if (!activeToneKey) return;
    setEditingPreset(true);
    setEditPresetError("");
    try {
      await savePreset(activeToneKey, currentPresetParams());
      await queryClient.invalidateQueries({ queryKey: ["presets"] });
      setSavePresetOpen(false);
      setEditPresetOpen(false);
    } catch (err) {
      setEditPresetError(err instanceof Error ? err.message : "Failed to update preset.");
    } finally {
      setEditingPreset(false);
    }
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
    const name = presetNameInput.trim().toLowerCase();
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
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-black tracking-tight text-foreground">Create</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Write your script, shape the voice, and render audio locally on your Mac.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT: Script + Output */}
        <div className="order-2 flex min-w-0 flex-col gap-6 xl:order-1">
        {/* Script card */}
        <section className="rounded-2xl border border-border bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-foreground">Script</h2>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={scriptHistory.length === 0}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-foreground/70 transition-all hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-white disabled:hover:text-foreground/70"
                  >
                    <History className="h-3.5 w-3.5" />
                    History
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[320px]">
                  {scriptHistory.map((entry) => (
                    <DropdownMenuItem
                      key={entry}
                      onSelect={() => setScript(entry)}
                      className="cursor-pointer text-[13px]"
                    >
                      <span className="block truncate">{entry.length > 80 ? `${entry.slice(0, 80)}…` : entry}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setScriptHistory([]);
                      writeScriptHistory([]);
                    }}
                    className="cursor-pointer text-[13px] text-[oklch(0.55_0.2_25)]"
                  >
                    Clear history
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
              >
                <Upload className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
                Import
              </button>
              <button
                onClick={() => setScript("")}
                disabled={!script.length}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-foreground/70 transition-all hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-white disabled:hover:text-foreground/70"
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
              className="h-[360px] w-full resize-none rounded-xl border border-border bg-[var(--background)] px-5 py-4 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/35 focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[color-mix(in oklch, var(--brand) 8%, transparent)]"
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
              title="Keyboard shortcuts — coming soon"
              aria-label="Keyboard shortcuts (coming soon)"
              className="ml-auto flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground"
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !script.trim()}
            className="group mt-5 flex w-full items-center justify-center gap-3 rounded-xl px-6 py-4 text-[15px] font-bold text-white transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:brightness-100"
            style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
          >
            {isGenerating ? (
              <span className="flex items-center gap-3 text-left">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="flex flex-col">
                  <span className="leading-tight">Running on-device…</span>
                  <span className="text-[11.5px] font-medium text-white/70">This may take a while</span>
                </span>
              </span>
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
              <GeneratingRow
                elapsed={elapsed}
                queued={genState.phase === "polling" && genState.status === "queued"}
                stopping={stopping}
                onCancel={handleCancelGeneration}
              />
            ) : genState.phase === "error" ? (
              <GenerationErrorState
                message={genState.message}
                requestId={genState.requestId}
                onRetry={handleGenerate}
                onDismiss={() => setGenState({ phase: "idle" })}
              />
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-bold text-foreground">Recent</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                A clean timeline of your latest renders, ready to replay, reuse, or download.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOutputSort((s) => (s === "desc" ? "asc" : "desc"))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${outputSort === "asc" ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-border bg-white text-foreground/80 hover:bg-muted"}`}
              >
                {outputSort === "desc" ? "Newest First" : "Oldest First"}
                <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
              </button>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${filterOpen ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-border bg-white text-foreground/80 hover:bg-muted"}`}
              >
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {filterOpen && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-[var(--background)] px-3 py-2">
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
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-[var(--background)] py-8 text-center">
                <AudioLines className="h-7 w-7 text-foreground/20" />
                <p className="text-[13px] font-medium text-foreground/40">No recordings yet</p>
                <p className="text-[12px] text-foreground/30">Generated files will appear here</p>
              </div>
            ) : (
              <>
                {filteredJobs.slice(0, visibleCount).map((job, idx) => (
                  <JobRow
                    key={job.request_id}
                    job={job}
                    preloadedUrl={genResult?.job.request_id === job.request_id ? genResult.url : undefined}
                    activePlayerId={activePlayerId}
                    onActivate={setActivePlayerId}
                    timelineStyle
                    isLatest={idx === 0 && outputSort === "desc"}
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
        <aside className="order-1 flex flex-col gap-4 xl:order-2">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-[18px] font-bold text-foreground">Voice Studio</h2>

          <StudioSection title="Voice Profile" badge={<InfoTip text="Choose the voice persona used for generation. Each profile has a unique timbre, accent, and delivery style — e.g. 'Aurora' for warm narration, 'Vox' for crisp announcements." />}>
            <div className="relative">
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
                      <span key={t} className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={tagStyle(t)}>
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
            </StudioSection>

          <StudioSection title="Tone / Style" badge={<InfoTip text="Sets the emotional delivery and pacing. 'Neutral' reads flat and even; 'Cheerful' adds lift and energy; 'Serious' slows the pace for weight and authority." />}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 text-left transition-all hover:border-[oklch(0.55_0.22_260/0.4)] hover:bg-[oklch(0.99_0.01_260)]"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ background: isUserPreset || tone === "Custom" ? BRAND_GRADIENT : BRAND }}
                  >
                    {isUserPreset || tone === "Custom" ? <Sparkles className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-foreground">{tone}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                      {tone === "Custom" ? "Unsaved custom settings" : isUserPreset ? "Saved custom tone" : "Built-in delivery preset"}
                    </span>
                  </span>
                  {isDirty && (
                    <span className="shrink-0 rounded-full bg-[oklch(0.55_0.22_260)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Modified
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 shrink-0 text-foreground/50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[min(21rem,calc(100vw-2rem))] p-1.5">
                <DropdownMenuLabel className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Built-in
                </DropdownMenuLabel>
                {builtInTones.map((t) => (
                  <DropdownMenuItem
                    key={t}
                    onSelect={() => handleToneSelect(t)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]"
                  >
                    <AudioLines className="h-3.5 w-3.5 text-[oklch(0.55_0.22_260)]" />
                    <span className="min-w-0 flex-1 truncate font-medium">{t}</span>
                    {tone === t && <Check className="h-3.5 w-3.5 text-[oklch(0.55_0.22_260)]" />}
                  </DropdownMenuItem>
                ))}

                {customTones.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Saved Custom
                    </DropdownMenuLabel>
                    {customTones.map((t) => (
                      <DropdownMenuItem
                        key={t}
                        onSelect={() => handleToneSelect(t)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px]"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[oklch(0.55_0.22_260)]" />
                        <span className="min-w-0 flex-1 truncate font-medium">{t}</span>
                        {tone === t && <Check className="h-3.5 w-3.5 text-[oklch(0.55_0.22_260)]" />}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => handleToneSelect("Custom")}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-[oklch(0.55_0.22_260)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 font-semibold">Create custom tone</span>
                  {tone === "Custom" && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </StudioSection>

          <StudioSection title="Output Format" defaultOpen={false} badge={<InfoTip text="Choose the audio file type. MP3 is compressed and small — great for sharing and web playback. WAV is uncompressed 16-bit PCM — best for editing or archival quality." />}>
            <div className="grid grid-cols-2 gap-2">
              <FormatTile active={format === "mp3"} onClick={() => setFormat("mp3")} title="MP3" subtitle={`${mp3Quality} kbps`} />
              <FormatTile active={format === "wav"} onClick={() => setFormat("wav")} title="WAV" subtitle={WAV_PRESETS.find((p) => p.id === wavQuality)?.short ?? "16-bit · 24k"} />
            </div>
          </StudioSection>



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
              className="mt-3 rounded-xl border border-border bg-[var(--background)] p-4"
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {isUserPreset ? (
                    <>
                      {isDirty ? (
                        <>
                          <button
                            onClick={handleUpdatePreset}
                            disabled={editingPreset || !activeToneKey}
                            className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
                          >
                            {editingPreset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Update
                          </button>
                          <button
                            onClick={openSaveAsPreset}
                            className="inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/70 transition-colors hover:bg-muted"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Save As
                          </button>
                        </>
                      ) : null}
                      <button
                        onClick={handleEditPresetOpen}
                        className="group inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/70 transition-all hover:border-[oklch(0.55_0.22_260/0.4)] hover:bg-[oklch(0.98_0.02_260)] hover:text-[oklch(0.45_0.22_260)]"
                      >
                        <Pencil className="h-3.5 w-3.5 transition-transform group-hover:-rotate-6" />
                        Edit
                      </button>
                      <button
                        onClick={handleRemovePreset}
                        disabled={removingPreset}
                        className="group inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/70 transition-all hover:border-[oklch(0.62_0.2_25/0.4)] hover:bg-[var(--brand-soft)] hover:text-[oklch(0.55_0.22_25)] disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/75 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reset to Default
                    </button>
                  )}

                  {/* Save Preset: only visible when in Custom mode */}
                  {tone === "Custom" && (
                    <button
                      onClick={() => { setSavePresetOpen((v) => !v); setSavePresetError(""); }}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110 sm:col-span-2"
                      style={{ boxShadow: "var(--shadow-btn)" }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Save Preset
                    </button>
                  )}
                </div>

                {/* Edit panel for user presets */}
                {isUserPreset && editPresetOpen && (
                  <div className="mt-3 rounded-xl border border-[oklch(0.55_0.22_260/0.25)] bg-[var(--brand-soft)] p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-[11.5px] font-semibold text-foreground/70">
                        Rename or update settings — current slider values will be saved.
                      </p>
                      <button
                        onClick={() => setEditPresetOpen(false)}
                        className="mt-[-2px] inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-foreground/60 hover:bg-muted"
                        aria-label="Close preset editor"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
                      >
                        {editingPreset ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Update
                      </button>
                    </div>
                    {editPresetError && (
                      <p className="mt-1.5 text-[11px] text-[oklch(0.5_0.2_25)]">{editPresetError}</p>
                    )}
                  </div>
                )}

                {tone === "Custom" && savePresetOpen && (
                  <div className="mt-3 rounded-xl border border-[oklch(0.55_0.22_260/0.25)] bg-[var(--brand-soft)] p-3">
                    <p className="mb-2 text-[11.5px] font-semibold text-foreground/70">
                      Name this preset — it will appear in the Tone chips above.
                    </p>
                    {(() => {
                      const trimmed = presetNameInput.trim().toLowerCase();
                      const allPresetKeys = presetsData ? Object.keys(presetsData) : [];
                      const collision = trimmed ? allPresetKeys.find((k) => k.toLowerCase() === trimmed) : undefined;
                      const nameError = collision ? `'${trimmed}' already exists — saving will update it.` : null;
                      return (
                        <div className="flex flex-col gap-2">
                          <input
                            autoFocus
                            value={presetNameInput}
                            onChange={(e) => { setPresetNameInput(e.target.value); setSavePresetError(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); if (e.key === "Escape") setSavePresetOpen(false); }}
                            placeholder="e.g. My Deep Voice"
                            maxLength={40}
                            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px] outline-none focus:border-[oklch(0.55_0.22_260)] focus:ring-2 focus:ring-[oklch(0.55_0.22_260/0.12)]"
                          />
                          {nameError && (
                            <p className="text-[11px] text-[oklch(0.5_0.15_260)]">{nameError}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleSavePreset}
                              disabled={savingPreset || !trimmed}
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
        <div className="flex items-center rounded-lg border border-border bg-[var(--background)] px-3 py-2 focus-within:border-[oklch(0.55_0.22_260)] focus-within:ring-4 focus-within:ring-[oklch(0.55_0.22_260/0.08)]">
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
                  (isSelected ? "bg-[var(--brand-soft)]" : "hover:bg-muted")
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
                        <span key={t} className="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold" style={tagStyle(t)}>
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
        className="flex items-center justify-between border-t border-border bg-[var(--background)] px-4 py-3 text-[12px] font-semibold text-[oklch(0.55_0.22_260)] transition-colors hover:bg-[var(--brand-soft)]"
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
                "linear-gradient(135deg, var(--brand), var(--brand-secondary))",
              boxShadow:
                "var(--shadow-btn)",
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

const GENERATION_STEPS = [
  {
    label: "Script accepted",
    detail: "Queued locally",
    icon: Sparkles,
  },
  {
    label: "Synthesizing voice",
    detail: "Rendering speech",
    icon: AudioLines,
  },
  {
    label: "Finalizing audio",
    detail: "Encoding the clip",
    icon: Disc3,
  },
] as const;

function getGenerationStep(elapsed: number, queued = false) {
  if (queued) return 1;
  if (elapsed < 6) return 1;
  if (elapsed < 45) return 2;
  return 3;
}

function getGenerationStatus(elapsed: number, queued = false) {
  const step = getGenerationStep(elapsed, queued);
  return GENERATION_STEPS[step - 1];
}

function GeneratingRow({
  elapsed,
  queued,
  stopping,
  onCancel,
}: {
  elapsed: number;
  queued: boolean;
  stopping: boolean;
  onCancel: () => void;
}) {
  const activeStep = getGenerationStep(elapsed, queued);
  const activeStatus = getGenerationStatus(elapsed, queued);
  const progressPct = queued ? 16 : Math.min(92, 24 + elapsed / 3);

  return (
    <div className="overflow-hidden rounded-2xl border border-[color-mix(in_oklch,var(--brand)_16%,white)] bg-[linear-gradient(180deg,var(--brand-soft)_0%,white_30%,var(--background)_100%)] shadow-[0_18px_36px_-28px_oklch(0.16_0.02_260/0.28)]">
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,white_0%,var(--brand-soft)_58%,color-mix(in_oklch,var(--brand)_20%,white)_100%)] text-[var(--brand)] shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="text-[15px] font-bold tracking-tight text-foreground">
                {queued ? "Waiting in queue…" : "Generating audio…"}
              </div>
              <span className="rounded-full border border-[color-mix(in_oklch,var(--brand)_20%,white)] bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand)] shadow-sm">
                {queued ? "Queued" : activeStatus.label}
              </span>
            </div>
            <div className="mt-1 text-[12.5px] text-foreground/60">
              {queued ? "Another render is using the engine right now." : `${activeStatus.detail} · ${fmtTime(elapsed)} elapsed`}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={stopping}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[oklch(0.78_0.12_25)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[oklch(0.55_0.2_25)] transition-colors hover:bg-[oklch(0.98_0.02_25)] disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>

      <div className="border-t border-[color-mix(in_oklch,var(--brand)_10%,white)] px-4 py-4 sm:px-5">
        <div className="grid gap-3 md:grid-cols-3">
          {GENERATION_STEPS.map((step, idx) => {
            const stepNumber = idx + 1;
            const isDone = !queued && stepNumber < activeStep;
            const isActive = stepNumber === activeStep;
            const Icon = step.icon;
            return (
              <div
                key={step.label}
                className={`rounded-xl border px-3 py-3 transition-colors ${
                  isActive
                    ? "border-[color-mix(in_oklch,var(--brand)_22%,white)] bg-white shadow-sm"
                    : isDone
                      ? "border-[color-mix(in_oklch,var(--brand-secondary)_22%,white)] bg-[var(--brand-soft)]/40"
                      : "border-border bg-white/70"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      isActive
                        ? "bg-[var(--brand)] text-white"
                        : isDone
                          ? "bg-[var(--brand-secondary)] text-white"
                          : "bg-muted text-foreground/45"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-foreground">{step.label}</div>
                    <div className="mt-0.5 text-[11.5px] leading-snug text-foreground/55">
                      {queued && stepNumber === 1 ? "Waiting for the engine" : isActive ? `${step.detail} now` : step.detail}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand),var(--brand-secondary),var(--brand-warm))] transition-[width] duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function StudioSection({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-5">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground/70">
          {title}
          {badge}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground/45 transition-colors hover:bg-muted hover:text-foreground sm:hidden"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
        >
        <ChevronDown
          className={
            "h-3.5 w-3.5 transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
        </button>
      </div>
      {/* Content — always visible on sm+, toggle-controlled on mobile */}
      <div className={open ? "mt-2" : "mt-2 hidden sm:block"}>{children}</div>
    </div>
  );
}

function EmptyOutputState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-[var(--background)] py-10 text-center">
      <AudioLines className="h-8 w-8 text-foreground/20" />
      <p className="text-[13px] font-medium text-foreground/40">Your result will appear here</p>
      <p className="text-[12px] text-foreground/30">Generated audio will appear here</p>
    </div>
  );
}

function GenerationErrorState({
  message,
  requestId,
  onRetry,
  onDismiss,
}: {
  message: string;
  requestId?: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const copyRequestId = async () => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
    } catch {}
  };

  return (
    <div className="rounded-xl border border-[oklch(0.62_0.2_25/0.3)] bg-[oklch(0.985_0.01_25)] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[oklch(0.62_0.2_25/0.12)] text-[oklch(0.55_0.2_25)]">
          <AlertCircle className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-foreground">Generation failed</div>
          <div className="mt-1 rounded-lg bg-white px-3 py-2 text-[13px] leading-relaxed text-foreground/80">
            {message}
          </div>
          {requestId && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-foreground/60">Request ID</span>
              <code className="rounded-md border border-border bg-white px-2 py-1 text-[11px] text-foreground/70">{requestId}</code>
              <button
                type="button"
                onClick={copyRequestId}
                className="rounded-md border border-border bg-white px-2 py-1 text-[11px] font-semibold text-foreground/70 transition-colors hover:bg-muted"
              >
                Copy
              </button>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[oklch(0.55_0.22_260)] px-3 py-2 text-[12px] font-bold text-white transition-all hover:brightness-110"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground/70 transition-colors hover:bg-muted"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
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
  timelineStyle = false,
  isLatest = false,
}: {
  job: Job;
  preloadedUrl?: string;
  activePlayerId: string | null;
  onActivate: (id: string | null) => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  timelineStyle?: boolean;
  isLatest?: boolean;
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
  const [hover, setHover]     = useState<number | null>(null);
  const menuRef  = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
  const [waveformBars, setWaveformBars] = useState<number[] | null>(null);

  useEffect(() => {
    if (preloadedUrl && fetchStatus !== "ready") {
      setBlobUrl(preloadedUrl);
      setFetchStatus("ready");
    }
  }, [preloadedUrl]);

  // Decode audio into amplitude buckets whenever a blob URL becomes available
  useEffect(() => {
    if (!blobUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(blobUrl);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = new AudioContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        await ctx.close();
        if (cancelled) return;

        const BAR_COUNT = 48;
        const data = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(data.length / BAR_COUNT);
        const bars: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let peak = 0;
          const start = i * blockSize;
          for (let j = start; j < start + blockSize; j++) {
            const abs = Math.abs(data[j]);
            if (abs > peak) peak = abs;
          }
          bars.push(peak);
        }
        // Normalise to [0.08, 1] so bars are never invisible
        const max = Math.max(...bars, 0.001);
        setWaveformBars(bars.map((v) => Math.max(0.08, v / max)));
      } catch {
        // decode failure — stay on fallback sine bars
      }
    })();
    return () => { cancelled = true; };
  }, [blobUrl]);

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

  // Derived values needed by both the draw loop and JSX — declared before the draw loop
  const audioDuration = duration || (job.audio_duration_s ?? 0);
  const jobPeaks = useMemo(() => jobSpeechPeaks(300, job.request_id), [job.request_id]);
  const peaks = waveformBars ?? jobPeaks;
  useEffect(() => {
    const progressRatio = audioDuration > 0 ? progress / audioDuration : 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr; canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = "oklch(0.92 0.01 260)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

        const barW = 2, gap = 2, slot = barW + gap;
        const count = Math.floor(w / slot);
        const playedX = progressRatio * w;
        const hoverX = hover != null ? hover * w : null;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, BRAND);
        grad.addColorStop(0.55, BRAND_SECONDARY);
        grad.addColorStop(1, BRAND_WARM);

        const dim = fetchStatus !== "ready";
        for (let i = 0; i < count; i++) {
          const p = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
          const bh = Math.max(2, p * (h * 0.9));
          const x = i * slot;
          const isPlayed = x < playedX;
          const inHover = hoverX != null && x >= playedX && x < hoverX;
          ctx.globalAlpha = dim ? 0.22 : 1;
          if (isPlayed && !dim)      ctx.fillStyle = grad;
          else if (inHover && !dim)  ctx.fillStyle = BRAND;
          else                       ctx.fillStyle = "oklch(0.55 0.04 260 / 0.32)";
          jobRoundedRect(ctx, x, (h - bh) / 2, barW, bh, 1);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        if (!dim) {
          ctx.strokeStyle = BRAND_WARM;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(playedX, 4); ctx.lineTo(playedX, h - 4); ctx.stroke();
          ctx.fillStyle = BRAND_WARM;
          ctx.beginPath(); ctx.arc(playedX, h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    };
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [peaks, progress, audioDuration, hover, fetchStatus]);

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

  const progressPct = audioDuration > 0 ? (progress / audioDuration) * 100 : 0;
  const titlePreview = job.text.slice(0, 60) + (job.text.length > 60 ? "…" : "");
  const voiceLabel = job.voice_name ?? "Generic";
  const presetLabel = job.preset.charAt(0).toUpperCase() + job.preset.slice(1);
  const formatLabel = job.output_format.toUpperCase();
  const ts = parseServerDate(job.completed_at ?? job.created_at);
  const isToday = ts.toDateString() === new Date().toDateString();
  const timeLabel = isToday
    ? `Today, ${ts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : ts.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const badges = [
    ...(audioDuration > 0 ? [fmtTime(audioDuration)] : []),
    job.output_format.toUpperCase(),
    ...(job.rtf != null ? [`RTF ${job.rtf.toFixed(2)}x`] : []),
  ];
  const activitySteps = [
    { label: "Generated", active: true },
    { label: "Saved", active: job.file_available !== false },
    { label: "Ready", active: fetchStatus !== "loading" && fetchStatus !== "expired" },
  ];

  return (
    <div
      className={`rounded-xl border bg-gradient-to-br from-white to-[var(--background)] ${
        timelineStyle
          ? "border-[color-mix(in_oklch,var(--brand)_12%,var(--border))] shadow-[0_14px_30px_-24px_oklch(0.16_0.02_260/0.35)]"
          : "border-border"
      }`}
    >
      {blobUrl && <audio ref={audioRef} src={blobUrl} preload="auto" />}

      {/* ── Header ── */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 pb-3 pt-4 sm:gap-4">
        <button
          onClick={handlePlayClick}
          disabled={fetchStatus === "expired"}
          aria-label={playing ? "Pause" : "Play"}
          className="group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
          style={{ background: BRAND_GRADIENT, boxShadow: "var(--shadow-btn)" }}
        >
          {playing && <span className="absolute inset-0 -m-1 animate-ping rounded-full border-2 border-[oklch(0.6_0.22_280)]/30" />}
          {fetchStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" />
            : playing ? <Pause className="h-4 w-4" fill="currentColor" />
            : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Disc3 className="h-3.5 w-3.5 shrink-0 text-[oklch(0.55_0.22_260)]" />
            <div className={`truncate text-[14px] font-bold ${fetchStatus === "expired" ? "text-foreground/45" : "text-foreground"}`}>{titlePreview}</div>
            {isLatest && (
              <span className="rounded-full bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--brand)]">
                Latest
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-foreground/50">
            {voiceLabel} · {presetLabel} · {formatLabel} · {timeLabel}
          </div>
          {timelineStyle && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-foreground/45">
              {activitySteps.map((step) => (
                <span
                  key={step.label}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 ${
                    step.active ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-muted text-foreground/40"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${step.active ? "bg-[var(--brand-secondary)]" : "bg-foreground/20"}`} />
                  {step.label}
                </span>
              ))}
            </div>
          )}
          {(job.generation_s != null || job.device != null) && (
            <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-foreground/35">
              <span>{job.text.split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
              {job.generation_s != null && <span>gen {job.generation_s.toFixed(1)}s</span>}
              {job.total_s != null && <span>total {job.total_s.toFixed(1)}s</span>}
              {job.device != null && <span className="uppercase">{job.device}</span>}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
            {badges.map((b) => <span key={b} className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/65">{b}</span>)}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {badges.map((b) => <span key={b} className="hidden rounded-md bg-muted px-2 py-1 text-[11.5px] font-semibold text-foreground/65 sm:inline">{b}</span>)}
          <div ref={menuRef} className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="rounded p-1 hover:bg-muted" aria-label="More options">
              <MoreVertical className="h-4 w-4 text-foreground/60" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-36 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
                <a href={`/api/v1/jobs/${encodeURIComponent(job.request_id)}/audio`} download={`vox-${job.request_id.slice(0, 8)}.${job.output_format}`} onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted ${!job.file_available ? "pointer-events-none opacity-40" : ""}`}>
                  <Download className="h-3.5 w-3.5 shrink-0" /> Download
                </a>
                <div className="h-px bg-border" />
                <button onClick={() => { setMenuOpen(false); onDelete?.(); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-[oklch(0.5_0.2_25)] hover:bg-[oklch(0.97_0.02_25)]">
                  <Trash2 className="h-3.5 w-3.5 shrink-0" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Waveform canvas ── */}
      <div className="relative mx-4 overflow-hidden rounded-lg border border-border bg-[oklch(0.99_0.005_280)]">
        <div className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.5), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.45), transparent 60%)" }} />
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            if (fetchStatus !== "ready") { handlePlayClick(); return; }
            const r = e.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            const t = ratio * audioDuration;
            setProgress(t);
            if (audioRef.current) audioRef.current.currentTime = t;
          }}
          className={"relative block h-[88px] w-full " + (fetchStatus === "ready" ? "cursor-pointer" : fetchStatus !== "expired" ? "cursor-pointer" : "")}
        />
        {hover != null && fetchStatus === "ready" && (
          <div className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-background shadow"
            style={{ left: `${hover * 100}%` }}>
            {fmtTime(hover * audioDuration)}
          </div>
        )}
      </div>

      {/* ── Transport bar ── */}
      {fetchStatus !== "expired" && (
        <div className="flex flex-col gap-2 px-4 pb-3 pt-3 sm:flex-row sm:items-center sm:gap-3 sm:py-3">
          <div className="flex items-center gap-3">
            <JobVolumeControl value={volume} muted={muted} onChange={(v) => { setVolume(v); setMuted(false); }} onToggleMute={() => setMuted((m) => !m)} />
            <SpeedControl value={speed} onChange={setSpeed} />
          </div>
          <div className="flex items-center gap-1 sm:ml-auto">
            <span className="mr-auto font-mono text-[11px] tabular-nums text-foreground/60 sm:mr-0">
              {fmtTime(progress)} <span className="text-foreground/35">/ {fmtTime(audioDuration)}</span>
            </span>
            <a href={`/api/v1/jobs/${encodeURIComponent(job.request_id)}/audio`} download={`vox-${job.request_id.slice(0, 8)}.${job.output_format}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] font-semibold text-foreground/75 hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
            {onRegenerate && (
              <button onClick={onRegenerate} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] font-semibold text-foreground/75 hover:bg-muted">
                <RefreshCw className="h-3.5 w-3.5" /> Reuse Script
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Expired banner ── */}
      {fetchStatus === "expired" && (
        <div className="mx-4 mb-4 mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-[oklch(0.82_0.08_40)] bg-[oklch(0.98_0.02_40)] px-3 py-2.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 text-[12px] text-[oklch(0.52_0.12_40)]">File expired — audio no longer available on disk</div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:flex-nowrap">
            <button onClick={handleCopyScript} className="inline-flex min-w-[7.5rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[oklch(0.82_0.08_40)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[oklch(0.45_0.12_40)] hover:bg-[oklch(0.96_0.04_40)]">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Keyboard className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Script"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── JobRow helpers ───────────────────────────────────────────────────────────

function jobRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function jobSpeechPeaks(n: number, seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const out: number[] = [];
  let i = 0;
  while (i < n) {
    const silence = rand() < 0.18;
    const len  = silence ? 3 + Math.floor(rand() * 8) : 10 + Math.floor(rand() * 30);
    const peak = silence ? 0.05 : 0.4 + rand() * 0.6;
    for (let j = 0; j < len && i < n; j++, i++) {
      out.push(Math.max(0.03, peak * Math.sin(Math.PI * (j / len)) * (0.7 + rand() * 0.6)));
    }
  }
  return out;
}

function JobVolumeControl({ value, muted, onChange, onToggleMute }: { value: number; muted: boolean; onChange: (v: number) => void; onToggleMute: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-white px-2 py-1">
      <button onClick={onToggleMute} className="text-foreground/60 hover:text-foreground" aria-label={muted ? "Unmute" : "Mute"}>
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
      <div className="relative h-1 w-20 rounded-full bg-muted">
        <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${(muted ? 0 : value) * 100}%`, background: "linear-gradient(90deg, var(--brand), var(--brand-warm))" }} />
        <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : value} onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0" aria-label="Volume" />
        <span className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[oklch(0.6_0.2_265)] shadow"
          style={{ left: `${(muted ? 0 : value) * 100}%` }} />
      </div>
    </div>
  );
}

function VoicePreviewPlayer({ voiceId }: { voiceId: string }) {
  const isGeneric = voiceId === "";
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [hover, setHover] = useState<number | null>(null);

  const peaks = useMemo(() => jobSpeechPeaks(220, voiceId || "generic"), [voiceId]);

  // Reset when voice changes
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
  }, [voiceId]);

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
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Canvas draw loop
  useEffect(() => {
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
          const isPlayed = !isGeneric && x < playedX;
          const inHover = !isGeneric && hoverX != null && x >= playedX && x < hoverX;
          ctx.globalAlpha = isGeneric ? 0.35 : 1;
          ctx.fillStyle = isPlayed ? grad : inHover ? BRAND : "oklch(0.55 0.04 260 / 0.3)";
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.moveTo(x + 1, y);
          ctx.arcTo(x + barW, y, x + barW, y + bh, 1);
          ctx.arcTo(x + barW, y + bh, x, y + bh, 1);
          ctx.arcTo(x, y + bh, x, y, 1);
          ctx.arcTo(x, y, x + barW, y, 1);
          ctx.closePath();
          ctx.fill();
        }
        if (!isGeneric && duration > 0) {
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
      }
    };
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [peaks, progress, duration, hover, isGeneric]);

  const src = voiceId ? `/api/v1/voices/${encodeURIComponent(voiceId)}/audio` : "";
  const fmt = (s: number) => { const t = Math.max(0, Math.floor(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

  return (
    <div className="mt-2.5">
      <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${isGeneric ? "text-foreground/35" : "text-foreground/40"}`}>Preview</p>
      <div className={`flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-white to-[var(--background)] px-3 py-2.5 ${isGeneric ? "opacity-50 select-none" : ""}`}>
        {!isGeneric && <audio ref={audioRef} src={src} preload="metadata" />}

        {/* Gradient play button */}
        <button
          onClick={() => !isGeneric && setPlaying((p) => !p)}
          disabled={isGeneric}
          aria-label={playing ? "Pause preview" : "Play preview"}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-70"
          style={{
            background: "linear-gradient(135deg, var(--brand), var(--brand-secondary), oklch(0.6 0.22 25))",
            boxShadow: "0 8px 18px -10px oklch(0.55 0.22 280 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.3)",
          }}
        >
          {playing && <span className="absolute inset-0 -m-0.5 animate-ping rounded-full border-2 border-[oklch(0.6_0.22_280)]/30" />}
          {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
        </button>

        {/* Time */}
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/55">{fmt(progress)}</span>

        {/* Waveform canvas */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-md bg-[oklch(0.99_0.005_280)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "radial-gradient(120% 100% at 0% 50%, oklch(0.95 0.04 260 / 0.5), transparent 60%), radial-gradient(120% 100% at 100% 50%, oklch(0.95 0.04 25 / 0.45), transparent 60%)" }}
          />
          <canvas
            ref={canvasRef}
            onMouseMove={(e) => {
              if (isGeneric) return;
              const r = e.currentTarget.getBoundingClientRect();
              setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              if (isGeneric || !duration) return;
              const r = e.currentTarget.getBoundingClientRect();
              const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
              const a = audioRef.current;
              if (a) { a.currentTime = pct * duration; setProgress(pct * duration); }
            }}
            className={`relative block h-9 w-full ${isGeneric ? "cursor-default" : "cursor-pointer"}`}
          />
        </div>

        {/* Duration */}
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/40">
          {duration > 0 ? fmt(duration) : "—:——"}
        </span>

        {/* Volume pill */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-1.5 py-1">
          <button
            onClick={() => setVolume((v) => v === 0 ? 0.7 : 0)}
            disabled={isGeneric}
            className="text-foreground/60 hover:text-foreground disabled:pointer-events-none"
            aria-label={volume === 0 ? "Unmute" : "Mute"}
          >
            {volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <div className="relative hidden h-1 w-14 rounded-full bg-muted sm:block">
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{ width: `${volume * 100}%`, background: "linear-gradient(90deg, var(--brand), var(--brand-warm))" }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              disabled={isGeneric}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:pointer-events-none"
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
