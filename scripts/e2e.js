import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const root = path.resolve(import.meta.dirname, "..");
const port = 4199;
const origin = `http://127.0.0.1:${port}`;
const chromeCandidates = process.platform === "win32"
  ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"]
  : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chromePath) throw new Error("Chrome or Chromium is required for npm run test:e2e");
const server = spawn(process.execPath, [path.join(root, "server", "index.js")], {
  cwd: root, env: { ...process.env, FIREBREAK_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (data) => logs += data);
server.stderr.on("data", (data) => logs += data);

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${origin}/api/state`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not start. ${logs}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector("#balance")?.textContent !== "—");
  await page.waitForFunction(() => !document.body.classList.contains("loading"));
  assert.equal(await page.locator("#balance").textContent(), "1,000");

  await page.locator("#amount").fill("25");
  const payResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/pay"));
  await page.locator("#pay-button").click();
  const payResponse = await payResponsePromise;
  const payState = await payResponse.json();
  assert.equal(payResponse.ok(), true, JSON.stringify(payState));
  assert.equal(payState.balance, 975);
  await page.waitForFunction(() => document.querySelector("#balance")?.textContent?.replaceAll(",", "") === "975");

  await page.locator('[data-view="lab"]').click();
  await page.locator('[data-attack="seed"]').click();
  await page.waitForFunction(() => document.querySelector("#evidence")?.textContent?.includes("BLOCKED"));
  await page.locator('[data-attack="flood"]').click();
  await page.waitForFunction(() => document.querySelector("#evidence")?.textContent?.includes("CONTAINED"));

  await page.locator('[data-view="security"]').click();
  assert.equal(await page.locator("#attempts").textContent(), "0");
  await page.locator("#auth-toggle").click();
  await page.waitForFunction(() => document.querySelector("#auth-pill")?.textContent === "OFFLINE");

  await page.locator('[data-view="wallet"]').click();
  await page.locator("#amount").fill("20");
  const outagePayPromise = page.waitForResponse((response) => response.url().endsWith("/api/pay"));
  await page.locator("#pay-button").click();
  const outagePay = await outagePayPromise;
  const outageState = await outagePay.json();
  assert.equal(outagePay.ok(), true, JSON.stringify(outageState));
  assert.equal(outageState.balance, 955);
  await page.waitForFunction(() => document.querySelector("#balance")?.textContent?.replaceAll(",", "") === "955");

  const evidenceDir = path.join(root, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  await page.locator('[data-view="lab"]').click();
  await page.screenshot({ path: path.join(evidenceDir, "firebreak-attack-lab.png"), fullPage: true });
  assert.deepEqual(pageErrors, []);
  console.log("E2E passed: payment, blocked seed theft, bounded PIN flood, authenticator outage, continued device payment.");
} finally {
  if (browser) await browser.close();
  server.kill();
}
