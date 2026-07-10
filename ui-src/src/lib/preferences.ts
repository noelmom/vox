import { getUserPreferences, patchUserPreferences, type UserPreferences } from "@/lib/api";

export const PREFERENCE_KEYS = [
  "vox:format",
  "vox:mp3Quality",
  "vox:wavQuality",
  "vox:advanced",
  "vox:voiceId",
  "vox:tone",
  "vox:theme",
  "vox:widget.requests",
  "vox:widget.minutes",
  "vox:update-channel",
  "vox:auto-update-checks",
  "vox:autoplay-completed",
] as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

export function readCachedPreference<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeCachedPreference(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function hydrateCachedPreferences(): Promise<UserPreferences> {
  const prefs = await getUserPreferences();
  for (const [key, value] of Object.entries(prefs)) {
    if ((PREFERENCE_KEYS as readonly string[]).includes(key)) {
      writeCachedPreference(key as PreferenceKey, value);
    }
  }
  return prefs;
}

export async function savePreferences(preferences: Partial<Record<PreferenceKey, unknown>>) {
  for (const [key, value] of Object.entries(preferences)) {
    writeCachedPreference(key as PreferenceKey, value);
  }
  await patchUserPreferences(preferences);
  window.dispatchEvent(new CustomEvent("vox:prefschanged"));
}
