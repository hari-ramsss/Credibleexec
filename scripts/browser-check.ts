import fs from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { root } from "../contracts/scripts/compile";
const installed = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));
const browser = await chromium.launch({
  headless: true,
  ...(installed ? { executablePath: installed } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const output = path.join(root, ".local");
fs.mkdirSync(output, { recursive: true });
try {
  await page.goto("http://127.0.0.1:3000", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await expect(
    page.getByRole("heading", { name: "Give your agent a goal." }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".local-banner")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.locator("#request")).toHaveValue(/Swap 1,000 USDC/);
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "How it works" }).click();
  await expect(
    page.getByRole("heading", { name: "Permission. Promise. Proof." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: false }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Give your agent a goal." }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error("Mobile viewport has horizontal overflow.");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Desktop/mobile rendering, example input, navigation, and no-overflow checks passed. Screenshots: .local/desktop.png and .local/mobile.png.",
  );
} finally {
  await browser.close();
}
