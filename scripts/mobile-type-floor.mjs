/**
 * Assert public pages have no visible text under 12px at a phone width.
 *
 *   pnpm build:client
 *   pnpm exec vite preview --host 127.0.0.1 --port 4173
 *   npm install playwright   # not a project dependency
 *   node scripts/mobile-type-floor.mjs
 *
 * BASE_URL defaults to http://127.0.0.1:4173.
 * WIDTH defaults to 390. Set SHOTS=1 to write full-page PNGs.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const width = Number(process.env.WIDTH || 390);
const shots = process.env.SHOTS === "1";
const shotDir = process.env.SHOT_DIR || "/opt/cursor/artifacts";

const pages = [
  { path: "/", name: "home", ready: "[data-site-page='home']" },
  { path: "/book", name: "book", ready: "[data-testid='booking-step']" },
  { path: "/studio-105", name: "studio-105", ready: "[data-testid='studio105-shell']" },
  {
    path: "/services/virtual-staging/pro-order",
    name: "virtual-staging-pro-order",
    ready: "[data-testid='virtual-staging-pro-rate']",
  },
  { path: "/pay-at-close", name: "pay-at-close", ready: "[data-testid='pay-at-close-landing']" },
];

function auditScript() {
  function shown(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.right < 0 || rect.bottom < 0) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const style = getComputedStyle(n);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (Number.parseFloat(style.opacity) === 0) return false;
    }
    return true;
  }

  const offenders = [];
  let min = Infinity;
  let checked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const raw = node.textContent || "";
    const text = raw.replace(/\s+/g, " ").trim();
    const el = node.parentElement;
    node = walker.nextNode();
    if (!text || !el) continue;
    if (el.closest("script, style, noscript, option, textarea")) continue;
    if (!shown(el)) continue;
    const size = Number.parseFloat(getComputedStyle(el).fontSize);
    if (!Number.isFinite(size)) continue;
    checked += 1;
    if (size < min) min = size;
    if (size < 11.95) {
      offenders.push({
        size: Math.round(size * 100) / 100,
        text: text.slice(0, 90),
        tag: el.tagName.toLowerCase(),
        className: String(el.className || "").slice(0, 140),
      });
    }
  }
  const root = document.documentElement;
  return {
    min: Number.isFinite(min) ? Math.round(min * 100) / 100 : null,
    checked,
    offenders: offenders.slice(0, 25),
    offenderCount: offenders.length,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width, height: 844 } });
let failed = false;
const results = [];

if (shots) await mkdir(shotDir, { recursive: true });

for (const entry of pages) {
  const url = new URL(entry.path, base).toString();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(entry.ready, { timeout: 30000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(400);
  const report = await page.evaluate(auditScript);
  report.path = entry.path;
  report.width = width;
  results.push(report);
  const ok = report.offenderCount === 0 && report.min !== null && report.min >= 11.95;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${entry.path} @ ${width}px  min=${report.min}px  nodes=${report.checked}  under12=${report.offenderCount}  scroll=${report.scrollWidth}/${report.clientWidth}`,
  );
  for (const item of report.offenders) {
    console.log(`  ${item.size}px <${item.tag}> ${item.text}`);
  }
  if (shots) {
    const file = `${shotDir}/phone-390-${entry.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  shot ${file}`);
  }
}

await browser.close();
if (failed) process.exit(1);
