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
  await expect(page.getByText("System Status")).toBeVisible();
});

test("mobile navigation remains available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeApi(page);
  await page.goto("/app");

  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Voice Studio" })).toBeVisible();
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
