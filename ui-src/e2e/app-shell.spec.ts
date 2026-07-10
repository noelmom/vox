import { expect, test, type Page } from "@playwright/test";

const settings = {
  device_resolved: "mps",
  model_name: "Chatterbox Turbo",
  model_ready: true,
  chip: "Apple M3",
  macos_version: "26.0",
  vox_version: "1.0.0-test",
  build_commit: "local-ci",
  build_built_at: "2026-07-10T00:00:00Z",
  output_dir: "/tmp/vox/outputs",
  voice_dir: "/tmp/vox/voices",
  input_dir: "/tmp/vox/input",
  ffmpeg_available: true,
  host: "127.0.0.1",
  output_ttl_hours: 24,
  max_voice_clip_duration_s: 120,
  default_max_chars: 3000,
  chunk_headroom_chars: 40,
};

async function installFakeApi(page: Page) {
  await page.route("**/health", (route) =>
    route.fulfill({ json: { status: "ok", device: "mps", model_state: "ready", model_ready: true } }),
  );
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith("/settings")) return route.fulfill({ json: settings });
    if (pathname.endsWith("/status")) {
      return route.fulfill({ json: { status: "ok", model: { state: "ready", ready: true } } });
    }
    if (pathname.endsWith("/stats")) {
      return route.fulfill({
        json: {
          total_requests: 0,
          today_requests: 0,
          total_minutes: 0,
          today_minutes: 0,
          sparkline_requests: [],
          sparkline_minutes: [],
          voice_count: 0,
          recording_count: 0,
          voices_disk_bytes: 0,
          recordings_disk_bytes: 0,
          disk_used_bytes: 0,
        },
      });
    }
    if (pathname.endsWith("/presets")) return route.fulfill({ json: { default: {} } });
    if (pathname.endsWith("/preferences")) return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
}

test("Create route renders against a deterministic API", async ({ page }) => {
  await installFakeApi(page);
  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Voice" })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
});

test("refresh restores a completed generation without attempting playback", async ({ page }) => {
  let audioRequests = 0;
  await installFakeApi(page);
  await page.addInitScript(() => {
    localStorage.setItem("vox:last-generation-request", "restored-job");
    localStorage.setItem("vox:autoplay-completed", "true");
  });
  await page.route("**/api/v1/jobs/restored-job", (route) => route.fulfill({ json: {
    request_id: "restored-job", status: "completed", text: "Restored generation.", preset: "default", output_format: "mp3",
    output_path: "/tmp/restored.mp3", chunks: 1, audio_duration_s: 8, generation_s: 1, encode_s: 0.1, total_s: 1.1,
    rtf: 0.1, error: null, error_code: null, state_detail: "Audio is ready.", progress_current: 1, progress_total: 1,
    voice_name: "Noel Demo", device: "mps", created_at: "2026-07-10 12:00:00", completed_at: "2026-07-10 12:00:01", file_available: true,
  } }));
  await page.route("**/api/v1/jobs/restored-job/audio", (route) => {
    audioRequests += 1;
    return route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("RIFF0000WAVE") });
  });

  await page.goto("/app");

  await expect(page.getByText("Restored generation").first()).toBeVisible();
  await page.waitForTimeout(350);
  expect(audioRequests).toBe(0);
  await expect(page.getByText("Playback could not start. Press Play to try again.")).not.toBeVisible();

  await page.getByRole("button", { name: "Play" }).first().click();
  await expect.poll(() => audioRequests).toBe(1);
});

test("completed generation stays paused when autoplay has not been enabled", async ({ page }) => {
  let audioRequests = 0;
  await installFakeApi(page);
  await page.route("**/api/v1/tts", (route) => route.fulfill({ json: { request_id: "completed-job" } }));
  await page.route("**/api/v1/jobs/completed-job", (route) => route.fulfill({ json: completedJob("completed-job") }));
  await page.route("**/api/v1/jobs/completed-job/audio", (route) => {
    audioRequests += 1;
    return route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("RIFF0000WAVE") });
  });

  await page.goto("/app");
  await page.getByRole("button", { name: "Generate Voice" }).click();
  await expect(page.getByText("Completed generation.").first()).toBeVisible();
  await page.waitForTimeout(350);
  expect(audioRequests).toBe(0);
});

test("completed generation autoplays when the preference is enabled", async ({ page }) => {
  let audioRequests = 0;
  await installFakeApi(page);
  await page.addInitScript(() => localStorage.setItem("vox:autoplay-completed", "true"));
  await page.route("**/api/v1/tts", (route) => route.fulfill({ json: { request_id: "autoplay-job" } }));
  await page.route("**/api/v1/jobs/autoplay-job", (route) => route.fulfill({ json: completedJob("autoplay-job") }));
  await page.route("**/api/v1/jobs/autoplay-job/audio", (route) => {
    audioRequests += 1;
    return route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("RIFF0000WAVE") });
  });

  await page.goto("/app");
  await page.getByRole("button", { name: "Generate Voice" }).click();
  await expect.poll(() => audioRequests).toBe(1);
});

test("Settings saves the completed-generation autoplay preference", async ({ page }) => {
  let savedPreferences: Record<string, unknown> | null = null;
  await installFakeApi(page);
  await page.route("**/api/v1/preferences", (route) => {
    if (route.request().method() === "PATCH") {
      savedPreferences = (route.request().postDataJSON() as { preferences: Record<string, unknown> }).preferences;
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/app/settings");
  const autoplay = page.getByRole("switch", { name: "Autoplay completed recordings" });
  await expect(autoplay).toHaveAttribute("aria-checked", "false");
  await autoplay.click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => savedPreferences?.["vox:autoplay-completed"]).toBe(true);
});

function completedJob(requestId: string) {
  return {
    request_id: requestId, status: "completed", text: "Completed generation.", preset: "default", output_format: "mp3",
    output_path: "/tmp/completed.mp3", chunks: 1, audio_duration_s: 8, generation_s: 1, encode_s: 0.1, total_s: 1.1,
    rtf: 0.1, error: null, error_code: null, state_detail: "Audio is ready.", progress_current: 1, progress_total: 1,
    voice_name: "Noel Demo", device: "mps", created_at: "2026-07-10 12:00:00", completed_at: "2026-07-10 12:00:01", file_available: true,
  };
}

test("mobile navigation remains available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeApi(page);
  await page.goto("/app");

  await expect(page.getByRole("navigation", { name: "Primary" }).getByText("Voices")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByText("History")).toBeVisible();
});

test("compact desktop keeps landmark navigation and content visible", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await installFakeApi(page);
  await page.goto("/app");
  await expect(page.locator("aside").getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("tablet layout keeps the workspace and primary navigation reachable", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await installFakeApi(page);
  await page.goto("/app");
  await expect(page.locator("aside").getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
});

test("wide desktop exposes the full labeled workspace navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installFakeApi(page);
  await page.goto("/app");
  const navigation = page.locator("aside").getByRole("navigation", { name: "Primary" });
  await expect(navigation.getByText("Create")).toBeVisible();
  await expect(navigation.getByText("Settings")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("authentication expiry replaces private shell with pairing gate", async ({ page }) => {
  await installFakeApi(page);
  await page.route("**/api/v1/alerts", (route) => route.fulfill({ status: 401, json: { detail: "Session expired" } }));
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Pair this device" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open pairing" })).toHaveAttribute("href", "/pair");
});

test("offline runtime disables generation and exposes recovery guidance", async ({ page }) => {
  await installFakeApi(page);
  await page.route("**/health", (route) => route.fulfill({ status: 503, json: { detail: "offline" } }));
  await page.route("**/api/v1/status", (route) => route.fulfill({ status: 503, json: { detail: "offline" } }));
  await page.goto("/app");
  await expect(page.getByText("Vox server is unavailable. Your draft and paused playback metadata are safe.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Server unavailable" })).toBeDisabled();
});

test("compatibility routes redirect to canonical workspaces", async ({ page }) => {
  await installFakeApi(page);
  await page.goto("/app/library");
  await expect(page).toHaveURL(/\/app\/voices$/);
  await page.goto("/app/recordings");
  await expect(page).toHaveURL(/\/app\/history$/);
  await page.goto("/logs");
  await expect(page).toHaveURL(/\/app\/settings\/diagnostics$/);
  await expect(page.getByRole("heading", { name: "Diagnostics", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
});

test("Voices exposes selected-profile handoff to Create", async ({ page }) => {
  await installFakeApi(page);
  await page.route("**/api/v1/voices", (route) => route.fulfill({ json: [{
    id: "voice-demo", name: "demo-voice", filename: "demo-voice.wav", description: "A warm narration voice.",
    tags: ["warm"], exaggeration: null, cfg_weight: null, temperature: null, repetition_penalty: null,
    top_p: null, min_p: null, created_at: "2026-07-10T00:00:00Z", is_favorite: false,
    display_name: "Demo voice", icon_data: null,
  }] }));
  await page.goto("/app/voices");
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("region", { name: "Selected voice" })).toContainText("Demo voice");
  await page.getByRole("button", { name: "Use in Create" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
});

test("global player metadata survives route navigation", async ({ page }) => {
  await installFakeApi(page);
  await page.route("**/api/v1/jobs/job-player/audio", (route) => route.fulfill({
    status: 200,
    contentType: "audio/wav",
    body: Buffer.from("RIFF0000WAVE"),
  }));
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Create", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("vox:play-job", { detail: {
    request_id: "job-player",
    text: "Persistent player test.",
    voice_name: "Noel Demo",
    audio_duration_s: 12,
    file_available: true,
  } })));
  await expect(page.getByRole("region", { name: "Audio player" })).toContainText("Persistent player test");
  await page.locator("aside").getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/app\/history$/);
  await expect(page.getByRole("region", { name: "Audio player" })).toContainText("Persistent player test");
});

test("History play control opens the global dock", async ({ page }) => {
  await installFakeApi(page);
  await page.route("**/api/v1/jobs?*", (route) => route.fulfill({ json: [{
    request_id: "history-job",
    status: "completed",
    text: "History playback contract.",
    preset: "calm",
    output_format: "wav",
    output_path: "/tmp/history-job.wav",
    chunks: 1,
    audio_duration_s: 125,
    generation_s: 1,
    encode_s: 0.1,
    total_s: 1.1,
    rtf: 0.1,
    error: null,
    error_code: null,
    state_detail: "Audio is ready.",
    progress_current: 1,
    progress_total: 1,
    voice_name: "Noel Demo",
    device: "mps",
    created_at: "2026-07-10 12:00:00",
    completed_at: "2026-07-10 12:00:01",
    file_available: true,
  }] }));
  await page.route("**/api/v1/jobs/history-job/audio", (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.from("RIFF0000WAVE") }));
  await page.goto("/app/history");
  await expect(page.getByText("Play opens Now Playing")).toBeVisible();
  await expect(page.locator("main canvas")).toHaveCount(0);
  await expect(page.getByText("2:05", { exact: true }).last()).toBeVisible();
  const play = page.getByRole("button", { name: "Play" });
  await expect(play).toHaveCount(1);
  await play.click();
  await expect(page.getByRole("region", { name: "Audio player" })).toContainText("History playback contract");
});

test("expired History audio offers regeneration instead of playback", async ({ page }) => {
  await installFakeApi(page);
  await page.route("**/api/v1/jobs?*", (route) => route.fulfill({ json: [{
    request_id: "expired-job", status: "completed", text: "Expired playback contract.", preset: "calm", output_format: "wav",
    output_path: null, chunks: 1, audio_duration_s: 8, generation_s: 1, encode_s: 0.1, total_s: 1.1, rtf: 0.1,
    error: null, error_code: null, state_detail: "Audio was cleaned up.", progress_current: 1, progress_total: 1,
    voice_name: "Noel Demo", device: "mps", created_at: "2026-07-10 12:00:00", completed_at: "2026-07-10 12:00:01", file_available: false,
  }] }));
  await page.goto("/app/history");
  await expect(page.getByText("Audio expired")).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play" })).toHaveCount(0);
});

test("Settings confirms a destructive backup restore before uploading", async ({ page }) => {
  await installFakeApi(page);
  let restoreRequests = 0;
  let revokeRequests = 0;
  await page.route("**/api/v1/backups/restore", (route) => {
    restoreRequests += 1;
    return route.fulfill({ json: { restored: true, voices_restored: 1, message: "Restored." } });
  });
  await page.route("**/api/v1/auth/credentials**", (route) => {
    if (route.request().method() === "DELETE") {
      revokeRequests += 1;
      return route.fulfill({ json: { revoked: true } });
    }
    return route.fulfill({
      json: [{
        id: "device-1",
        kind: "session",
        name: "Kitchen iPad",
        scopes: ["admin"],
        created_at: "2026-07-10T00:00:00Z",
        expires_at: null,
        last_used_at: null,
      }],
    });
  });
  await page.goto("/app/settings");

  await expect(page.getByText("Paired devices & API tokens")).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revoke Kitchen iPad?" })).toBeVisible();
  expect(revokeRequests).toBe(0);
  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect.poll(() => revokeRequests).toBe(1);

  await page.locator('input[type="file"]').setInputFiles({
    name: "Vox-Backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("test-backup"),
  });

  await expect(page.getByRole("heading", { name: "Restore this Vox backup?" })).toBeVisible();
  expect(restoreRequests).toBe(0);
  await page.getByRole("button", { name: "Restore backup" }).last().click();
  await expect.poll(() => restoreRequests).toBe(1);
});

test("Settings surfaces a rejected backup without leaving the page", async ({ page }) => {
  await installFakeApi(page);
  await page.route("**/api/v1/backups/restore", (route) => route.fulfill({
    status: 400,
    json: { detail: "Backup contains an unsafe entry.", request_id: "restore-test" },
  }));
  await page.goto("/app/settings");

  await page.locator('input[type="file"]').setInputFiles({
    name: "unsafe.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("unsafe-backup"),
  });
  await page.getByRole("button", { name: "Restore backup" }).last().click();

  await expect(page.getByText("Backup contains an unsafe entry. (restore-test)")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/settings$/);
});
