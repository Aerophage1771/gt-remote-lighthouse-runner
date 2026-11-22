#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import puppeteer from "puppeteer";
import { chromium } from "playwright-core";

const ORIGIN = "https://germainetutoring.com";
const SESSION_ID = 990023;
const EXPECTED_SHA256 = "0d06f74f887afaa42684b92bfc0f5058f67d70593c0ee7e724b924b09fe41571";
const OUTPUT = path.resolve("release-artifacts");

const urls = JSON.parse(process.env.GT_PRIVATE_PREVIEW_PART_URLS || "[]");
if (!Array.isArray(urls) || urls.length !== 5) {
  throw new Error("Expected five private fixture URLs in GT_PRIVATE_PREVIEW_PART_URLS.");
}

async function fetchPrivateFixture() {
  const parts = [];
  for (const url of urls) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`Private fixture fetch failed with HTTP ${response.status}.`);
    parts.push((await response.text()).trim());
  }
  const bytes = zlib.gunzipSync(Buffer.from(parts.join(""), "base64"));
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha !== EXPECTED_SHA256) throw new Error(`Fixture SHA mismatch: ${sha}`);
  return bytes.toString("utf8");
}

const user = {
  id: "private-preview-student",
  username: "private-preview",
  email: "preview@example.invalid",
  role: "student",
  diagnostic_status: "completed",
  sessions_held: 1,
  time_remaining: 0,
  bonus_test_review_time: 0,
  first_name: "Preview",
  last_name: "Student",
};

const session = {
  id: SESSION_ID,
  date: "2026-08-23T12:00:00-04:00",
  duration: "2",
  status: "completed",
  review_session_id: null,
  rescheduled_from_session_id: null,
  status_changed_at: "2026-08-23T14:00:00-04:00",
  completed_at: "2026-08-23T14:00:00-04:00",
  title: "Getting Unstuck on Difficult LSAT Questions",
  summary: "Private long-document Past Sessions preview.",
  session_summary_format: "document",
  structured_summary: null,
  summary_doc: {
    id: SESSION_ID,
    title: "Getting Unstuck on Difficult LSAT Questions",
    kicker: "Question-Oriented Session Analysis",
    subtitle: "Private long-document Past Sessions preview.",
    session_date: "2026-08-23T12:00:00-04:00",
    key_topics: ["Decision-making", "Prephrasing", "Flaw", "RC"],
    summary: "Private long-document Past Sessions preview.",
  },
  transcript: null,
  video_link: null,
  attachments: [],
};

function json(body) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function installMocks(context, html) {
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN || !url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }

    if (url.pathname === "/api/auth/me") {
      await route.fulfill(json({ user, preview: null }));
      return;
    }
    if (url.pathname === "/api/dashboard/sessions") {
      await route.fulfill(json([session]));
      return;
    }
    if (url.pathname === "/api/dashboard/assignments" || url.pathname === "/api/dashboard/lsat/homework") {
      await route.fulfill(json([]));
      return;
    }
    if (url.pathname === `/api/dashboard/sessions/${SESSION_ID}/summary.html`) {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      return;
    }

    await route.fulfill(json({}));
  });
}

async function waitForReader(page) {
  const selector = `iframe[src*="/api/dashboard/sessions/${SESSION_ID}/summary.html"]`;
  await page.locator(selector).waitFor({ state: "attached", timeout: 30000 });
  await page.waitForFunction(
    id => [...document.querySelectorAll("iframe")].some(frame =>
      frame.src.includes(`/api/dashboard/sessions/${id}/summary.html`) &&
      frame.contentDocument?.body?.textContent?.includes("Getting Unstuck on Difficult LSAT Questions")
    ),
    SESSION_ID,
    { timeout: 30000 },
  );
  await page.waitForTimeout(750);
}

async function applyInternalScrollPreview(page) {
  await page.evaluate(id => {
    const frame = [...document.querySelectorAll("iframe")].find(node => node.src.includes(`/api/dashboard/sessions/${id}/summary.html`));
    if (!frame) throw new Error("Session summary iframe not found.");
    frame.removeAttribute("scrolling");
    frame.setAttribute("data-internal-scroll-preview", "true");
    frame.style.setProperty("height", "min(72dvh, 820px)", "important");
    frame.style.setProperty("min-height", "560px", "important");
    frame.style.setProperty("max-height", "820px", "important");
    if (window.innerWidth < 768) {
      frame.style.setProperty("height", "68dvh", "important");
      frame.style.setProperty("min-height", "500px", "important");
      frame.style.setProperty("max-height", "680px", "important");
    }
  }, SESSION_ID);
  await page.waitForTimeout(250);
}

async function getFrame(page) {
  const handle = await page.locator(`iframe[src*="/api/dashboard/sessions/${SESSION_ID}/summary.html"]`).elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error("Could not access session iframe frame.");
  return frame;
}

async function metrics(page, frame, viewport) {
  const outer = await page.evaluate(id => {
    const root = document.documentElement;
    const iframe = [...document.querySelectorAll("iframe")].find(node => node.src.includes(`/api/dashboard/sessions/${id}/summary.html`));
    const rect = iframe?.getBoundingClientRect();
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      iframe: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      sidebarBackground: getComputedStyle(document.querySelector(".student-portal-sidebar") || document.body).backgroundColor,
    };
  }, SESSION_ID);
  const inner = await frame.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      canScrollVertically: root.scrollHeight > root.clientHeight + 1,
    };
  });
  return { viewport, outer, inner };
}

function galleryHtml(report) {
  const cards = report.captures.map(c => `
    <section class="card">
      <h2>${c.viewport}</h2>
      <p>Outer horizontal overflow: ${c.metrics.outer.horizontalOverflow}px · Reader horizontal overflow: ${c.metrics.inner.horizontalOverflow}px · Reader vertical scroll: ${c.metrics.inner.canScrollVertically ? "yes" : "no"}</p>
      <div class="shots">
        <figure><img src="${c.top}" alt="${c.viewport} top"><figcaption>Top of Past Sessions reader</figcaption></figure>
        <figure><img src="${c.mid}" alt="${c.viewport} internally scrolled"><figcaption>Same page, reader scrolled internally</figcaption></figure>
      </div>
    </section>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Past Sessions Preview</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#eef2f5;color:#152235}main{max-width:1500px;margin:auto;padding:28px}h1{margin:0 0 8px}p{line-height:1.5}.notice{padding:12px 14px;background:white;border:1px solid #ccd5de;border-radius:8px;margin:16px 0 28px}.card{background:white;border:1px solid #ccd5de;border-radius:10px;padding:18px;margin:0 0 26px}.shots{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}figure{margin:0}img{width:100%;height:auto;border:1px solid #b8c3ce;display:block}figcaption{font-size:13px;margin-top:7px;color:#586778}@media(max-width:800px){main{padding:14px}.shots{grid-template-columns:1fr}}</style></head><body><main><h1>Private Past Sessions long-document preview</h1><div class="notice">Current GermaineTutoring frontend shell. All <code>/api/</code> responses were mocked inside Playwright; no production student/session data was read or written. The session-analysis HTML was reconstructed from a private fixture and SHA-256 verified during this build.</div>${cards}</main></body></html>`;
}

await fs.rm(OUTPUT, { recursive: true, force: true });
await fs.mkdir(OUTPUT, { recursive: true });

const report = { origin: ORIGIN, fixtureSha256: EXPECTED_SHA256, captures: [] };
let browser;
try {
  const html = await fetchPrivateFixture();
  browser = await chromium.launch({
    headless: true,
    executablePath: puppeteer.executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 960, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
    });
    await installMocks(context, html);
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/dashboard/past-sessions?session=${SESSION_ID}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await waitForReader(page);
    await applyInternalScrollPreview(page);
    const frame = await getFrame(page);
    const captureMetrics = await metrics(page, frame, viewport.name);

    const top = `${viewport.name}-top.png`;
    const mid = `${viewport.name}-reader-mid.png`;
    await page.screenshot({ path: path.join(OUTPUT, top), type: "png", fullPage: false });
    await frame.evaluate(() => window.scrollTo(0, Math.max(0, (document.documentElement.scrollHeight - window.innerHeight) * 0.45)));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUTPUT, mid), type: "png", fullPage: false });
    report.captures.push({ viewport: viewport.name, top, mid, metrics: captureMetrics });
    await context.close();
  }

  await fs.writeFile(path.join(OUTPUT, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT, "index.html"), galleryHtml(report));
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  await fs.writeFile(path.join(OUTPUT, "error.txt"), message);
  await fs.writeFile(path.join(OUTPUT, "index.html"), `<!doctype html><meta name="robots" content="noindex,nofollow"><title>Preview error</title><pre>${message.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre>`);
  console.error(message);
} finally {
  await browser?.close();
}
