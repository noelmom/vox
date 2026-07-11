import { expect, request, test } from "@playwright/test";

test("an unpaired LAN browser completes the one-time pairing flow", async ({ browser }) => {
  const localApi = await request.newContext({ baseURL: "http://127.0.0.1:4181" });
  const codeResponse = await localApi.post("/api/v1/auth/pairing-codes");
  expect(codeResponse.ok()).toBeTruthy();
  const { code } = await codeResponse.json() as { code: string };

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4181",
    extraHTTPHeaders: { "X-Test-Remote": "1" },
  });
  const page = await context.newPage();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/pair$/);
  await expect(page.getByRole("heading", { name: "Pair with Vox" })).toBeVisible();

  await page.getByLabel("Device name").fill("Kitchen iPad");
  await page.getByLabel("Pairing code").fill(code);
  await page.getByRole("button", { name: "Pair device" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Vox Studio paired" })).toBeVisible();
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === "vox_session");
  expect(session?.httpOnly).toBeTruthy();
  expect(session?.sameSite).toBe("Strict");

  await context.close();

  const secondContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4181",
    extraHTTPHeaders: { "X-Test-Remote": "1" },
  });
  const secondPage = await secondContext.newPage();
  await secondPage.goto("/pair");
  await secondPage.getByLabel("Device name").fill("Second browser");
  await secondPage.getByLabel("Pairing code").fill(code);
  await secondPage.getByRole("button", { name: "Pair device" }).click();
  await expect(secondPage.getByRole("alert")).toHaveText("Pairing failed. Check the code and try again.");
  await secondContext.close();
  await localApi.dispose();
});
