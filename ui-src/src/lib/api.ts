/* Vox API client */

export type ApiVoice = {
  id: string;
  name: string;
  filename: string;
  description: string | null;
  tags: string[];
  exaggeration: number | null;
  cfg_weight: number | null;
  temperature: number | null;
  repetition_penalty: number | null;
  top_p: number | null;
  min_p: number | null;
  created_at: string;
  is_favorite: boolean;
  display_name: string | null;
  icon_data: string | null;
};

export type Job = {
  request_id: string;
  status: string;
  text: string;
  preset: string;
  output_format: string;
  output_path: string | null;
  chunks: number | null;
  audio_duration_s: number | null;
  generation_s: number | null;
  encode_s: number | null;
  total_s: number | null;
  rtf: number | null;
  error: string | null;
  voice_name: string | null;
  device: string | null;
  created_at: string;
  completed_at: string | null;
  file_available: boolean;
};

export function parseServerDate(value: string): Date {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(path, init);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error((err as { detail?: string }).detail ?? r.statusText);
  }
  return r;
}

export async function healthCheck() {
  return apiFetch("/health").then((r) => r.json());
}

export async function listVoices(): Promise<ApiVoice[]> {
  return apiFetch("/api/v1/voices").then((r) => r.json());
}

export async function listPresets(): Promise<Record<string, object>> {
  return apiFetch("/api/v1/presets").then((r) => r.json());
}

export async function submitTTS(params: {
  text: string;
  preset?: string;
  voice_name?: string;
  output_format?: string;
  max_chars?: number;
  temperature?: number;
  exaggeration?: number;
  cfg_weight?: number;
  repetition_penalty?: number;
  top_p?: number;
  min_p?: number;
  mp3_bitrate?: number;
  wav_bit_depth?: string;
}): Promise<{ request_id: string }> {
  const fd = new FormData();
  fd.append("text", params.text);
  fd.append("preset", params.preset ?? "confident");
  fd.append("output_format", params.output_format ?? "mp3");
  if (params.voice_name) fd.append("voice_name", params.voice_name);
  if (params.max_chars != null) fd.append("max_chars", String(params.max_chars));
  if (params.temperature != null) fd.append("temperature", String(params.temperature));
  if (params.exaggeration != null) fd.append("exaggeration", String(params.exaggeration));
  if (params.cfg_weight != null) fd.append("cfg_weight", String(params.cfg_weight));
  if (params.repetition_penalty != null) fd.append("repetition_penalty", String(params.repetition_penalty));
  if (params.top_p != null) fd.append("top_p", String(params.top_p));
  if (params.min_p != null) fd.append("min_p", String(params.min_p));
  if (params.mp3_bitrate != null) fd.append("mp3_bitrate", String(params.mp3_bitrate));
  if (params.wav_bit_depth != null) fd.append("wav_bit_depth", params.wav_bit_depth);
  const r = await apiFetch("/api/v1/tts", { method: "POST", body: fd });
  return r.json();
}

export async function savePreset(
  name: string,
  params: {
    temperature: number;
    exaggeration: number;
    cfg_weight: number;
    repetition_penalty: number;
    top_p: number;
    min_p: number;
  },
): Promise<void> {
  await apiFetch(`/api/v1/presets/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function deletePreset(name: string): Promise<void> {
  await apiFetch(`/api/v1/presets/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function getJob(requestId: string): Promise<Job> {
  return apiFetch(`/api/v1/jobs/${encodeURIComponent(requestId)}`).then((r) => r.json());
}

export async function getJobAudio(requestId: string): Promise<Blob> {
  const r = await apiFetch(`/api/v1/jobs/${encodeURIComponent(requestId)}/audio`);
  return r.blob();
}

export async function listJobs(params?: { limit?: number; offset?: number }): Promise<Job[]> {
  const q = new URLSearchParams({
    limit: String(params?.limit ?? 50),
    offset: String(params?.offset ?? 0),
  });
  return apiFetch(`/api/v1/jobs?${q}`).then((r) => r.json());
}

export async function uploadVoice(formData: FormData): Promise<ApiVoice> {
  const r = await apiFetch("/api/v1/voices", { method: "POST", body: formData });
  return r.json();
}

export async function deleteVoice(name: string): Promise<void> {
  await apiFetch(`/api/v1/voices/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export type ServerSettings = {
  device_config: string;
  device_resolved: string;
  host: string;
  configured_host: string;
  host_restart_required: boolean;
  port: number;
  output_dir: string;
  voice_dir: string;
  input_dir: string;
  output_ttl_hours: number;
  job_retention_days: number;
  deleted_voice_ttl_hours: number;
  chunk_headroom_chars: number;
  max_voice_clip_duration_s: number;
  voice_icon_max_kb: number;
  ffmpeg_available: boolean;
  ffmpeg_path: string;
  model_name: string;
  default_max_chars: number;
  macos_version: string;
  chip: string;
  vox_version: string;
  build_commit: string;
  build_built_at: string;
};

export type Stats = {
  total_requests: number;
  today_requests: number;
  total_minutes: number;
  today_minutes: number;
  sparkline_requests: number[];
  sparkline_minutes: number[];
  // library & storage
  voice_count: number;
  recording_count: number;
  voices_disk_bytes: number;
  recordings_disk_bytes: number;
  disk_used_bytes: number;
};

export type SystemAlert = {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
};

export async function getStats(): Promise<Stats> {
  return apiFetch("/api/v1/stats").then((r) => r.json());
}

export async function getAlerts(): Promise<SystemAlert[]> {
  return apiFetch("/api/v1/alerts").then((r) => r.json());
}

export async function getServerSettings(): Promise<ServerSettings> {
  return apiFetch("/api/v1/settings").then((r) => r.json());
}

export async function patchServerSettings(patch: { host?: "127.0.0.1" | "0.0.0.0" }): Promise<{
  changed: Record<string, string>;
  host: string;
  configured_host: string;
  host_restart_required: boolean;
}> {
  const r = await apiFetch("/api/v1/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.json();
}

export async function deleteJob(requestId: string): Promise<void> {
  await apiFetch(`/api/v1/jobs/${encodeURIComponent(requestId)}`, { method: "DELETE" });
}

export async function cancelJob(requestId: string): Promise<void> {
  await apiFetch(`/api/v1/tts/${encodeURIComponent(requestId)}/cancel`, { method: "POST" });
}

type VoicePatch = Partial<
  Pick<ApiVoice, "description" | "tags" | "exaggeration" | "cfg_weight" | "temperature" | "repetition_penalty" | "top_p" | "min_p" | "is_favorite" | "display_name" | "icon_data">
>;

export async function patchVoice(name: string, patch: VoicePatch): Promise<ApiVoice> {
  const fd = new FormData();
  if (patch.description != null)        fd.append("description", patch.description);
  if (patch.tags != null)               fd.append("tags", patch.tags.join(","));
  if (patch.exaggeration != null)       fd.append("exaggeration", String(patch.exaggeration));
  if (patch.cfg_weight != null)         fd.append("cfg_weight", String(patch.cfg_weight));
  if (patch.temperature != null)        fd.append("temperature", String(patch.temperature));
  if (patch.repetition_penalty != null) fd.append("repetition_penalty", String(patch.repetition_penalty));
  if (patch.top_p != null)              fd.append("top_p", String(patch.top_p));
  if (patch.min_p != null)              fd.append("min_p", String(patch.min_p));
  if (patch.is_favorite != null)        fd.append("is_favorite", patch.is_favorite ? "1" : "0");
  // "" signals the server to clear the field; undefined/null = don't touch
  if (patch.display_name !== undefined) fd.append("display_name", patch.display_name ?? "");
  if (patch.icon_data !== undefined)    fd.append("icon_data", patch.icon_data ?? "");
  const r = await apiFetch(`/api/v1/voices/${encodeURIComponent(name)}`, { method: "PATCH", body: fd });
  return r.json();
}
