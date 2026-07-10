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
  private_fields_redacted?: boolean;
};

export type LogFileName = "server" | "server-error" | "helper" | "helper-error" | "install";

export type LogFileTail = {
  name: LogFileName;
  path: string;
  lines: string[];
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
    const data = err as { detail?: unknown; error?: { message?: string }; request_id?: string };
    const detail = typeof data.detail === "string" ? data.detail : undefined;
    const message = data.error?.message ?? detail ?? r.statusText;
    const suffix = data.request_id ? ` (${data.request_id})` : "";
    throw new Error(`${message}${suffix}`);
  }
  return r;
}

export async function healthCheck() {
  return apiFetch("/health").then((r) => r.json());
}

export async function getLogFile(name: LogFileName, lines = 200): Promise<LogFileTail> {
  const q = new URLSearchParams({ lines: String(lines) });
  return apiFetch(`/api/v1/logs/files/${encodeURIComponent(name)}?${q}`).then((r) => r.json());
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
  configured_output_ttl_hours: number;
  output_ttl_restart_required: boolean;
  job_retention_days: number;
  deleted_voice_ttl_hours: number;
  chunk_headroom_chars: number;
  configured_chunk_headroom_chars: number;
  chunk_headroom_restart_required: boolean;
  max_voice_clip_duration_s: number;
  max_voice_upload_mb: number;
  max_script_chars: number;
  configured_max_voice_clip_duration_s: number;
  max_voice_clip_duration_restart_required: boolean;
  voice_icon_max_kb: number;
  max_backup_upload_mb: number;
  max_backup_expanded_mb: number;
  max_backup_entries: number;
  ffmpeg_available: boolean;
  ffmpeg_path: string;
  model_name: string;
  model_state: string;
  model_ready: boolean;
  default_max_chars: number;
  configured_default_max_chars: number;
  default_max_chars_restart_required: boolean;
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

export type UserPreferences = Record<string, unknown>;

export async function getUserPreferences(): Promise<UserPreferences> {
  return apiFetch("/api/v1/preferences").then((r) => r.json());
}

export async function patchUserPreferences(preferences: UserPreferences): Promise<void> {
  await apiFetch("/api/v1/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences }),
  });
}

export async function getServerSettings(): Promise<ServerSettings> {
  return apiFetch("/api/v1/settings").then((r) => r.json());
}

export type ServerSettingsPatch = {
  host?: "127.0.0.1" | "0.0.0.0";
  output_ttl_hours?: number;
  max_voice_clip_duration_s?: number;
  default_max_chars?: number;
  chunk_headroom_chars?: number;
};

export async function patchServerSettings(patch: ServerSettingsPatch): Promise<{
  changed: Record<string, string>;
  host: string;
  configured_host: string;
  host_restart_required: boolean;
  output_ttl_hours: number;
  configured_output_ttl_hours: number;
  output_ttl_restart_required: boolean;
  max_voice_clip_duration_s: number;
  configured_max_voice_clip_duration_s: number;
  max_voice_clip_duration_restart_required: boolean;
  default_max_chars: number;
  configured_default_max_chars: number;
  default_max_chars_restart_required: boolean;
  chunk_headroom_chars: number;
  configured_chunk_headroom_chars: number;
  chunk_headroom_restart_required: boolean;
}> {
  const r = await apiFetch("/api/v1/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.json();
}

export type RemoteCredential = {
  id: string;
  kind: "session" | "token";
  name: string;
  scopes: Array<"read" | "generate" | "admin">;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
};

export async function listRemoteCredentials(): Promise<RemoteCredential[]> {
  return apiFetch("/api/v1/auth/credentials").then((r) => r.json());
}

export async function createPairingCode(): Promise<{ code: string; expires_at: string }> {
  return apiFetch("/api/v1/auth/pairing-codes", { method: "POST" }).then((r) => r.json());
}

export async function createApiToken(payload: {
  name: string;
  scopes: Array<"read" | "generate" | "admin">;
}): Promise<{ id: string; token: string; name: string; scopes: string[]; expires_at: string | null; notice: string }> {
  return apiFetch("/api/v1/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

export async function revokeRemoteCredential(id: string): Promise<void> {
  await apiFetch(`/api/v1/auth/credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function revokeAllRemoteCredentials(): Promise<number> {
  const result = await apiFetch("/api/v1/auth/revoke-all", { method: "POST" }).then((r) => r.json());
  return result.revoked as number;
}

export async function deleteJob(requestId: string): Promise<void> {
  await apiFetch(`/api/v1/jobs/${encodeURIComponent(requestId)}`, { method: "DELETE" });
}

export async function cancelJob(requestId: string): Promise<void> {
  await apiFetch(`/api/v1/tts/${encodeURIComponent(requestId)}/cancel`, { method: "POST" });
}

export async function exportBackup(): Promise<Blob> {
  const r = await apiFetch("/api/v1/backups/export");
  return r.blob();
}

export async function restoreBackup(file: File): Promise<{ restored: boolean; voices_restored: number; message: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await apiFetch("/api/v1/backups/restore", { method: "POST", body: fd });
  return r.json();
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
