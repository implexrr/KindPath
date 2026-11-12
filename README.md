# KindPath

KindPath scans one public web page with Playwright and axe-core, returns an accessibility report as JSON, and shows a static browser-rendered preview with visual-impairment presets. It runs locally; no public service or deployment is included.

## Run locally

Requirements: Node.js 22.12 or newer and a running local Docker engine (Docker Desktop on macOS).

```sh
npm ci
npm run dev
```

Open [KindPath locally](http://127.0.0.1:5173/). The API listens on `127.0.0.1:3001`.

`npm run dev` builds the current scanner and firewall runtime images before starting the API and Vite. The first build can download public packages and images; subsequent builds reuse Docker's cache. Browser QA images are only needed for the browser checks, not normal development. If Docker is unavailable, setup stops with an explanation; Chromium never runs directly on the host as a fallback. Ctrl+C stops the dev processes.

Website scanning and capture are **enabled by default for local use**. Enter a URL, select **Scan website**, and download the JSON report or open **Visual preview**. Addresses without a scheme default to HTTPS. The URL scan button waits for the bounded capability check before accepting a submission. Ordinary URL submissions never silently become sample findings. The landing page includes a static side-by-side illustration of blur and a red–green colour vision simulation.

To disable real scanning or capture in a local process:

```sh
KINDPATH_PUBLIC_SCANNING=false KINDPATH_PUBLIC_CAPTURE=false npm run dev
```

Feature flags accept only the literal values `true` and `false`; unset flags default to enabled. Invalid values stop startup without echoing their contents.

The app keeps results in browser memory. Reloading clears them. No database, account, hosted service, AI API integration or paid feature is required.

## One-page behavior

KindPath follows at most ten main-document requests and analyzes only the final document. It never crawls links. Redirects may change the path/query on the original hostname, add/remove one leading `www.`, or upgrade HTTP to HTTPS. Unrelated host/subdomain changes, HTTPS downgrades, invalid destinations and genuine loops are rejected with explanations. Submitted and final URLs are retained in the report. A bounded browser restart does not reset the navigation budget.

Each destination independently passes public DNS/address validation, destination pinning, verified firewall approval and HTTPS certificate validation. Loading assets is separate from crawling. Source scripts run only in the isolated browser to render the submitted page; captured scripts are never replayed in the app.

When a scan finishes, select **View report** to move to the results. The API returns JSON. **Download report JSON** near the report heading exports the findings, incomplete checks, coverage and limitations without embedding the preview image. Automated results do not establish accessibility conformance. Manual keyboard, screen-reader and usability review is still necessary.

After five seconds, KindPath can stop unfinished resource loads when the successful main document has fully arrived, its HTML is parsed, and the page has rendered text. Other pages keep the full 15-second loading window. The report is explicitly marked `pageLoadIncomplete: true`, with a partial-coverage notice in the interface and JSON export. An unfinished main document or rejected navigation still fails.

A site may return an error, a login/consent page, or different content to the anonymous browser. HTTP 403 is reported as an access refusal; KindPath does not guess its cause or bypass it. Missing resources and bounded findings are disclosed. A valid report remains available if image capture alone fails, provided document stability and resource cleanup are verified.

## Visual previews

Real-page previews use a JPEG rendered in the same isolated visit as the report. This preserves the loaded page's layout, images, fonts, colours and rendered component content without rebuilding its HTML/CSS.

- The vision presets sit above the snapshots. Open **Fine-tune effects** for intensity, colour and individual strengths.
- **Fit width** shows the desktop-width image inside each comparison panel. **Actual size** supports scrolling to inspect small details. Desktop shows both panels. On phones, switch between **Original** and **Simulated** to compare the same scroll position in the captured image.
- The vision buttons offer **Original**, **Protanopia**, **Deuteranopia**, **Tritanopia**, **Blurred vision**, and **Reduced peripheral vision**. The colour dropdown also offers **Grayscale**. The named colour buttons start at 100% strength, and lower settings interpolate between the [Machado model’s published severity matrices](https://pubmed.ncbi.nlm.nih.gov/19834201/). The previews illustrate possible colour differences. Individual vision varies.
- Effects render inside the sandboxed preview document, alongside its image. Changing effects refreshes only the modified document from the stored capture and can reset its scroll position; it does not rescan the website.
- The original panel stays unchanged. Link areas highlight on hover; navigation and form interaction are disabled. Hover highlights do not reproduce a source site's scripted hover behavior. Visible ads are part of the static image.
- Captures are bounded to the scan viewport's width (up to 1,280 pixels), the first 6,000 pixels of height, and 1.5 MB of JPEG data. Long-page truncation is labelled. Horizontal overflow outside the scan viewport, content requiring interaction, and resources not loaded by the source browser are not included.
- A screenshot is an image rather than a semantic, responsive or interactive replica. Changing the panel width scales the captured desktop page; it does not rerun its responsive layout. Live content can change between scans.

Images are independently validated and embedded in sandboxed, opaque-origin iframes. The image document permits only embedded image data and trusted styling; scripts, external connections, frames, forms and navigation targets are absent. No third-party page markup or resource URL is copied into it. Controlled DOM previews are also exercised by the automated browser checks.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Local API status |
| GET | `/api/scanning-capabilities` | Current scanning/capture flags and URL policy |
| POST | `/api/scan-public` | One `{ "url": "https://example.com/" }` request; real report and optional image preview |
| POST | `/api/scan-fixture` | Scan a fixed fixture for controlled checks |
| POST | `/api/analyze` | Return an illustrative report without fetching the URL |

For successful scans, KindPath labels clearly identifiable browser verification and sign-in screens in the report and preview. The API and JSON download include an optional `pageNotice` code and a plain-language limitation. Detection uses the rendered page and can miss unfamiliar screens. Findings and previews describe the page KindPath received.

A successful real scan has `mode: "public"`, `requestedUrl`, final `url`, `scanId`, findings, scanner metadata and coverage. `sitePreview` contains the same identity, `kind: "image"`, dimensions, truncation flag, capture timestamp, guarded HTML and limitations. If capture alone fails, `previewUnavailable: true` replaces `sitePreview`; the report limitations explain this. Cleanup failure overrides successful results and capture/status explanations.

## Invite-only staging

`npm run build:production` prints the path to a fresh release under
`build/production-*`. The release contains the built UI, compiled API, scanner
runtime policy files, and npm manifests. Install and run it from that directory:

```sh
npm ci --omit=dev --ignore-scripts
npm start
```

Provide these settings to the service process. Startup requires each one.

| Setting | Value |
| --- | --- |
| `KINDPATH_STAGE_ORIGIN` | The exact browser-facing HTTPS origin, for example `https://staging.example.test`, without a trailing slash |
| `KINDPATH_STAGE_PASSWORD_SHA256` | The SHA-256 digest of a 64-character lowercase hexadecimal password |
| `KINDPATH_PUBLIC_SCANNING` | `true` or `false` |
| `KINDPATH_PUBLIC_CAPTURE` | `true` or `false`. Capture is available with real scanning enabled |

Generate the password from 32 random bytes using a trusted password manager
or cryptographic random generator. Hash the 64-character password as text
without a trailing newline. Keep the digest in protected service configuration
outside the release, and share the password with testers privately. The
browser prompts for the username `kindpath` and the password.

The app listens on `127.0.0.1:3002`. Run one instance on a dedicated Linux host
and put an HTTPS reverse proxy on the same host. Preserve the browser-facing
`Host`, `Origin`, and `Authorization` headers. For example, the
[Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
configuration for your staging hostname is:

```caddyfile
staging.example.test {
  reverse_proxy 127.0.0.1:3002
}
```

The frontend and API both require the shared credential. API POST requests
require the configured origin and share a limit of six requests per rolling
minute across testers. The scanner admits one scan at a time. The proxy
should keep responses uncached and exclude credentials and request bodies from
logs. Keep the installed release files read-only to the service account.
Have the supervisor run `node server/production.js` directly from the release
directory and give active requests and scanner cleanup time to drain during
shutdown.

Build the worker and firewall from the same reviewed checkout with
`npm run scanner:build -- --runtime`. The app uses `/usr/bin/docker` and the
local Unix socket on Linux. Keep the Docker socket and backend port private.
Socket access gives the service substantial control over the host, so use a
dedicated host with no personal files, unrelated credentials, or private
workloads. See [Docker Engine security](https://docs.docker.com/engine/security/).

Before inviting testers, record the exact runtime image digests and review
their advisories on the target architecture. Run the controlled scanner and
firewall checks on that host. Start with both feature flags set to `false` and
verify that the proxy requires credentials over HTTPS. After approval to
enable the flags, verify one approved URL through the browser, including the
JSON report and preview presets, and check that a private destination is
rejected. To suspend real scans and capture, set both flags to `false` and
restart the service gracefully.

## Isolation and limits

The scanner has no host-file mounts or forwarded credentials. It uses non-root containers, a read-only root filesystem, Chromium sandboxing, bounded memory/CPU/processes and temporary container storage. The browser has no external network interface; its gateway uses an independently verified firewall and pinned public destinations. Private, loopback and link-local destinations are rejected. Downloads, WebSockets and service workers are disabled.

A public scan’s Chromium container has a two-CPU quota by default. Set `KINDPATH_PUBLIC_BROWSER_CPUS=1` if Docker has only one CPU available. Only one scan can run at a time. Per-scan admission, cancellation and verified cleanup remain authoritative. Container-removal errors are not treated as successful cleanup. Unconfirmed resources block new scans. Existing bounds include 16 destination hosts, 64 public IPv4 addresses, 250 browser resource requests, ten document requests, a 15-second loading deadline and a 60-second orchestration deadline. These limits can make resource-heavy sites incomplete. Results disclose request failures and omitted findings; they do not promise full coverage.

## Checks

```sh
npm test
npm run build:production
npm run scanner:build
npm run test:scanner
npm run test:gateway:unit
npm run test:gateway
npm run test:firewall
npm run build
npm run test:preview
npm audit --include=dev --audit-level=low
npm --prefix scanner audit --audit-level=low
```

The controlled test commands explicitly disable default public scanning/capture in their processes. Network tests use synthetic internal origins; UI checks run in network-disabled browser containers. They cover URL/report identity, redirects, cancellation, private-network rejection, cleanup, raster validation, image dimensions/pixels, desktop/mobile fitting, scrolling, presets, inert hover/navigation and JSON export. Test images are generated from project-owned fixture content. Diagnostic logs and generated review artifacts stay ignored under `logs/`.

CI is defined in `.github/workflows/ci.yml`; running local checks does not publish, push or deploy. Historical observations and package-advisory assessments under `scanner/` describe their recorded versions, not current activation defaults or a guarantee of compatibility. See [image assessment](scanner/IMAGE-ASSESSMENT.md) for that assessment's limitations; package audits alone do not establish browser, kernel or Docker safety.


## Manual Chrome validation

With Google Chrome installed and KindPath running through `npm run dev`, this
opt-in check submits up to three public URLs through the real interface:

```sh
npm ci --prefix scanner --ignore-scripts
npm run validate:chrome -- --live https://example.com/
```

It uses the existing locked Playwright client and installed, visible Google
Chrome with a fresh temporary profile, project-local temporary files and an
environment that excludes shell credentials. Personal Chrome profiles are never
opened; the test process disables sync and uses a mock keychain. Chrome can access only the loopback
KindPath interface; submitted websites still load in the isolated scanner.
The check verifies report identity, an actual JSON download, image decoding,
vision presets, colour pixels where a suitable patch exists, inert navigation,
fit/actual-size controls, fresh identities on repeated scans, clearing results
on reload, and rejecting private URL entry before a scan request. You may repeat
a URL to check rescan behavior. The first submission uses the keyboard, and
addresses without a scheme exercise the normal HTTPS default. Query-bearing
validation inputs are rejected to keep query credentials out of artifacts; the application's URL policy is unchanged.
Reports, screenshots and summaries stay ignored under `logs/chrome-validation/`;
the temporary Chrome profile is removed afterward. The relay rejects filesystem
routes and reads responses with a streaming size limit; output folders cannot be
symbolic links. A site refusing access or
returning no preview is recorded and makes the check exit unsuccessfully.
This command never runs as part of CI and does not deploy anything.
