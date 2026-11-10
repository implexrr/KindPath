// Manual opt-in Chrome validation. Source websites still run only in the isolated scanner.
// A deny-all proxy and loopback relay constrain the fresh browser; no personal profile is used.
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { colourMatrix } from "../src/components/visualEffects.ts";
import { navigationRejection } from "../scanner/gateway/navigation.mjs";
import { websiteUrl } from "../scanner/gateway/url.mjs";
import { normalizeWebsiteEntry } from "../src/components/websiteEntry.ts";
const args = process.argv.slice(2);
if (args[0] !== "--live" || args.length < 2 || args.length > 4) throw new Error("Usage: npm run validate:chrome -- --live <one to three public URLs>");
const targets = args.slice(1).map((value) => {
  const url = websiteUrl(normalizeWebsiteEntry(value));
  if (url.search) throw new Error("Use validation URLs without query strings so artifacts cannot contain query credentials.");
  return url.href;
});
const root = fileURLToPath(new URL("../", import.meta.url));
const logs = join(root, "logs", "chrome-validation");
await mkdir(logs, { recursive: true });
const out = await mkdtemp(join(logs, "run-"));
await mkdir(out + "/tmp");
await mkdir(out + "/downloads");
process.env.TMPDIR = out + "/tmp";
let chromium;
try {
  ({ chromium } = await import(new URL("../scanner/node_modules/playwright/index.mjs", import.meta.url).href));
} catch {
  throw new Error("Install the existing scanner client first: npm ci --prefix scanner --ignore-scripts");
}
const capabilities = await fetch("http://127.0.0.1:5173/api/scanning-capabilities", { redirect: "error", signal: AbortSignal.timeout(3e3) }).then((response) => response.json());
assert.ok(capabilities.publicScanningEnabled === true && capabilities.publicCaptureEnabled === true, "Start npm run dev with scanning and capture enabled.");
const base = "http://127.0.0.1:5173", allowedPosts = /* @__PURE__ */ new Set(["/api/scan-public", "/api/scan-fixture"]);
const proxy = http.createServer((_req, res) => {
  res.writeHead(403);
  res.end();
});
proxy.on("connect", (_req, socket) => socket.destroy());
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
let context, profile;
const results = [];
let actual, requests = 0;
const errors = [];
const interrupted = new AbortController();
const stop = () => {
  interrupted.abort();
  void context?.close().catch(() => {
  });
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  profile = await mkdtemp(out + "/profile-");
  context = await chromium.launchPersistentContext(profile, { env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "en_US.UTF-8", TMPDIR: out + "/tmp" }, channel: "chrome", headless: false, viewport: { width: 1440, height: 1e3 }, deviceScaleFactor: 1, acceptDownloads: true, downloadsPath: out + "/downloads", serviceWorkers: "block", proxy: { server: "http://127.0.0.1:" + proxy.address().port }, args: ["--proxy-bypass-list=<-loopback>", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--use-mock-keychain", "--password-store=basic", "--disable-crash-reporter", "--disable-breakpad", "--disable-sync"] });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.protocol === "blob:" || url.protocol === "data:") {
      await route.continue();
      return;
    }
    const get = req.method() === "GET" && (url.pathname === "/" || url.pathname === "/favicon.ico" || ["/src/", "/shared/", "/scanner/gateway/", "/node_modules/", "/@vite/", "/@id/", "/@fs/" + root + "/"].some((prefix) => url.pathname.startsWith(prefix)) || url.pathname === "/@react-refresh" || url.pathname === "/api/scanning-capabilities");
    const post = req.method() === "POST" && allowedPosts.has(url.pathname);
    if (url.origin !== base || !get && !post) {
      errors.push("Unexpected browser destination");
      await route.abort();
      return;
    }
    try {
      if (post && url.pathname === "/api/scan-public") {
        assert.ok(targets.includes(JSON.parse(req.postData()).url));
        requests++;
      }
      const response = await fetch(url, { method: req.method(), redirect: "error", headers: { Origin: base, ...post ? { "Content-Type": "application/json" } : {} }, ...post ? { body: req.postData() } : {}, signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(95e3)]) });
      const body = Buffer.from(await response.arrayBuffer());
      assert.ok(body.length <= 8 * 1024 * 1024);
      if (post) actual = { status: response.status, report: JSON.parse(body.toString()) };
      const headers = Object.fromEntries(response.headers);
      for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection"]) delete headers[name];
      await route.fulfill({ status: response.status, headers, body });
    } catch (error) {
      errors.push("Loopback relay failed");
      await route.abort().catch(() => {
      });
    }
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(2e4);
  page.on("pageerror", (error) => errors.push(error.name));
  const version = context.browser().version();
  console.log("Google Chrome " + version + " (fresh project profile; loopback UI only)");
  await page.goto(base);
  await page.getByRole("button", { name: "Scan website", exact: true }).waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
  const scanIds = new Set();
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    actual = void 0;
    const before = requests;
    const input = page.getByLabel("Your website URL");
    const entered = args[index + 1];
    const previous = await input.inputValue();
    await input.fill(entered);
    if (previous !== entered) assert.equal(await page.locator(".results").count(), 0);
    if (index === 0) await input.press("Enter");
    else await page.getByRole("button", { name: "Scan website", exact: true }).click();
    await page.locator(".results").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.querySelector("form")?.getAttribute("aria-busy") === "false", void 0, { timeout: 1e5 });
    assert.equal(requests, before + 1);
    assert.ok(actual);
    const report = actual.report;
    if (actual.status !== 200) {
      const result2 = { target, status: actual.status, diagnostic: report.diagnostic, message: await page.getByRole("alert").innerText() };
      results.push(result2);
      console.log(JSON.stringify(result2));
      continue;
    }
    assert.equal(report.mode, "public");
    assert.equal(report.requestedUrl, target);
    assert.equal(navigationRejection(target, report.url), void 0);
    assert.match(report.scanId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.ok(!scanIds.has(report.scanId), "A new scan must not reuse the previous report identity");
    scanIds.add(report.scanId);
    await page.locator(".results").waitFor();
    const event = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download report JSON", exact: true }).click();
    const download = await event;
    const parts = [];
    for await (const part of await download.createReadStream()) parts.push(Buffer.from(part));
    const exported = JSON.parse(Buffer.concat(parts).toString());
    assert.equal(exported.application, "KindPath");
    assert.equal(exported.report.url, report.url);
    assert.equal(exported.report.requestedUrl, target);
    assert.deepEqual(exported.report.findings, report.findings);
    assert.equal(exported.report.pageLoadIncomplete, report.pageLoadIncomplete);
    assert.equal(exported.report.sitePreview, void 0);
    assert.equal(exported.report.scanId, void 0);
    await download.saveAs(out + "/downloads/report-" + index + ".json");
    await page.getByRole("button", { name: /Visual preview/ }).click();
    if (report.previewUnavailable) {
      results.push({ target, status: 200, outcome: "report-only" });
      console.log(JSON.stringify(results.at(-1)));
      continue;
    }
    const snapshot = report.sitePreview;
    assert.equal(snapshot.kind, "image");
    assert.equal(snapshot.scanId, report.scanId);
    assert.equal(snapshot.requestedUrl, target);
    assert.equal(snapshot.url, report.url);
    const frames = page.locator("iframe"), original = frames.nth(0), modified = frames.nth(1);
    assert.equal(await frames.count(), 2);
    for (let i = 0; i < 2; i++) {
      const frame = page.frameLocator("iframe").nth(i);
      await frame.locator("img").evaluate((img) => img.decode());
      assert.equal(await frames.nth(i).getAttribute("sandbox"), "");
      assert.equal(await frames.nth(i).getAttribute("referrerpolicy"), "no-referrer");
      assert.equal(await frame.locator("script,form,iframe,a[href]").count(), 0);
      assert.ok(await frame.locator("body").evaluate(() => {
        try {
          void parent.document;
          return false;
        } catch {
          return true;
        }
      }));
    }
    const presets = page.getByRole("group", { name: "Vision presets", exact: true });
    const ready = async () => {
      const source = await modified.getAttribute("srcdoc");
      const expected = source.match(/<body style="filter:([^"]*)"/)?.[1] ?? "";
      const matrix = source.match(/<feColorMatrix type="matrix" values="([^"]*)"/)?.[1] ?? null;
      const normalized = await page.evaluate((value) => {
        const e = document.createElement("div");
        e.style.filter = value;
        return e.style.filter;
      }, expected);
      for (let n = 0; n < 100; n++) {
        try {
          const ok = await page.frameLocator("iframe").nth(1).locator("body").evaluate((body, { normalized: normalized2, matrix: matrix2 }) => body.style.filter === normalized2 && (body.ownerDocument.querySelector("feColorMatrix")?.getAttribute("values") ?? null) === matrix2, { normalized, matrix });
          if (ok) {
            await page.frameLocator("iframe").nth(1).locator("img").evaluate((img) => img.decode());
            return;
          }
        } catch {
        }
        await page.waitForTimeout(25);
      }
      throw new Error("Current preview document did not load");
    };
    const select = async (name) => {
      await presets.getByRole("button", { name, exact: true }).click();
      await ready();
    };
    await select("Original");
    const originalSource = await original.getAttribute("srcdoc");
    const address = page.frames().map((frame) => frame.url());
    const baseline = await original.screenshot();
    const sample = await page.frameLocator("iframe").nth(0).locator("img").evaluate((img) => {
      const image = img, canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const scale = image.getBoundingClientRect().width / image.naturalWidth, maxY = Math.min(image.naturalHeight - 10, (innerHeight - 30) / scale);
      for (let y = 30; y < maxY; y += 13) for (let x = 30; x < image.naturalWidth - 30; x += 13) {
        const p = [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
        if (Math.max(...p) - Math.min(...p) < 60) continue;
        let flat = true;
        for (const [dx, dy] of [[-4, -4], [4, 4], [-4, 4], [4, -4]]) if ([...ctx.getImageData(x + dx, y + dy, 1, 1).data].slice(0, 3).some((v, i) => Math.abs(v - p[i]) > 3)) flat = false;
        if (flat) return { x, y, rgb: p, scale };
      }
      return null;
    });
    const renderedPixel = async () => {
      assert.ok(sample);
      await modified.scrollIntoViewIfNeeded();
      const box = await modified.boundingBox(), bytes = await page.screenshot({ clip: box });
      return page.evaluate(async ({ data, x, y }) => {
        const img = new Image();
        img.src = "data:image/png;base64," + data;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
      }, { data: bytes.toString("base64"), x: Math.floor(sample.x * sample.scale), y: Math.floor(sample.y * sample.scale) });
    };
    const pixels = [];
    for (const [name, preset] of [["Red\u2013green colour vision", "red-green"], ["Blue\u2013yellow colour vision", "blue-yellow"]]) {
      await select(name);
      if (sample) {
        const expected = colourMatrix(preset, 65), actual2 = await renderedPixel(), rgb = sample.rgb.map((_v, row) => Math.round(sample.rgb.reduce((sum, v, col) => sum + v * expected[row * 5 + col], 0)));
        rgb.forEach((v, i) => assert.ok(Math.abs(v - actual2[i]) <= 8, `Colour sample expected ${rgb}, got ${actual2}`));
        pixels.push({ preset, expected: rgb, actual: actual2 });
      }
    }
    await select("Blurred vision");
    assert.notDeepEqual(await modified.screenshot(), baseline);
    await select("Reduced peripheral vision");
    assert.equal(await page.locator(".field-mask").evaluate((el) => el.style.opacity), "0.65");
    await select("Original");
    assert.deepEqual(await original.screenshot(), baseline);
    assert.equal(await original.getAttribute("srcdoc"), originalSource);
    assert.equal(requests, before + 1, "Effects must not rescan");
    assert.deepEqual(page.frames().map((frame) => frame.url()), address);
    const hotspot = page.frameLocator("iframe").nth(0).locator(".kp-link").first();
    if (await hotspot.count()) await hotspot.dispatchEvent("click");
    assert.equal(context.pages().length, 1);
    assert.deepEqual(page.frames().map((frame) => frame.url()), address);
    await page.getByLabel("Preview size", { exact: true }).selectOption("actual");
    await page.frameLocator("iframe").nth(0).locator("img").evaluate((img) => img.decode());
    assert.equal(await page.frameLocator("iframe").nth(0).locator("img").evaluate((img) => img.getBoundingClientRect().width), snapshot.width);
    await page.getByLabel("Preview size", { exact: true }).selectOption("fit");
    await page.frameLocator("iframe").nth(0).locator("img").evaluate((img) => img.decode());
    await original.screenshot({ path: out + "/preview-" + index + ".png" });
    const result = { target, status: 200, outcome: "report-and-preview", finalUrl: report.url, findings: report.findings.length, pageLoadIncomplete: report.pageLoadIncomplete === true, width: snapshot.width, height: snapshot.height, truncated: snapshot.truncated, json: true, presets: true, pixels };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  const requestsBeforeReload = requests;
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
  assert.equal(await page.locator(".results,iframe").count(), 0, "Reload must clear ephemeral reports and previews");
  await page.getByLabel("Your website URL").fill("http://127.0.0.1/");
  await page.getByLabel("Your website URL").press("Enter");
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /public HTTP\/HTTPS hostname/);
  assert.equal(requests, requestsBeforeReload, "A rejected private URL must not reach the scan API");
  assert.equal(await page.locator(".results,iframe").count(), 0);
  console.log("Reload and private-URL rejection passed without another scan.");
  assert.deepEqual(errors, []);
  await writeFile(out + "/result.json", JSON.stringify({ chrome: context.browser().version(), reloadClearsResults: true, privateUrlRejectedLocally: true, results }, null, 2));
  if (results.some((result) => result.outcome !== "report-and-preview")) process.exitCode = 1;
  console.log("Validation artifacts are in " + out);
} finally {
  try {
    await context?.close();
  } finally {
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(() => resolve()));
    if (profile) await rm(profile, { recursive: true, force: true });
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await writeFile(out + "/attempt-results.json", JSON.stringify(results, null, 2));
  }
}
