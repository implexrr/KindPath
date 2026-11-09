# KindPath

KindPath explores website accessibility through automated checks, actionable example findings, and side-by-side visual comparisons. It combines a React interface, an Express API, and an isolated Playwright/axe-core fixture worker.

## Features

- Website URL submission with server-side validation and clear error messages.
- Real axe-core checks on two controlled fixtures, with violations separated from checks needing review.
- Impact-first findings, severity counts/filtering, and repair guidance paired with each affected element.
- Complete JSON downloads and a print layout for saving reports as PDF.
- Example accessibility findings with severity, impact, and suggested improvements.
- Side-by-side previews with adjustable colour, contrast, blur, and peripheral field effects.
- Matching snapshots for both scanning fixtures, plus a separate garden illustration for demo reports; navigation and forms stay disabled.
- Manual review prompts alongside automated-testing guidance.
- Responsive layouts and standalone design mockups.

## Current capabilities

**Public URL scanning is disabled.** The URL form returns illustrative demo findings and never fetches the submitted website. The separate isolated-fixture action runs real axe-core checks on a built-in example. It does not scan the submitted URL.

For fixture reports, the visual preview captures the same selected built-in page. Demo reports retain a separate Community garden illustration. Neither captures the submitted URL. Effects are illustrative approximations, not reproductions of an individual's vision or a medical condition.

Automated checks and visual simulations cannot establish accessibility conformance. Keyboard, screen reader, and usability evaluation remain essential.

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The development launcher starts Vite on port 5173 and Express on port 3001. Both bind to the local machine. Stop both with Ctrl+C.

```sh
npm run check  # Check frontend and backend TypeScript
npm test       # Run API, validation, visual-effect, and report export tests
npm run build  # Check types and create the frontend dist/ output
```

The frontend build does not include the API server. Use `npm run dev` to run the complete application locally; `vite preview` alone does not provide the backend.

## Isolated fixture scanning

Install and start Docker Desktop on macOS (or a local Docker Engine on Linux). Firewall verification requires Docker Engine 28 or newer with nftables support. Build both dedicated images:

```sh
npm run scanner:build
npm run test:scanner
npm run test:firewall
```

Run the app, select a **Built-in page** (Garden form with barriers or Labelled garden form), and choose **Run isolated fixture scan**. A missing engine or image produces an unavailable error; there is no fallback to Chromium on the host. The worker dependencies are locked separately in `scanner/package-lock.json` and are installed inside the image, not in your host browser environment.

The worker runs with networking disabled, no host bind mounts or forwarded credentials, a read-only root filesystem, a non-root user, no container capabilities, Chromium sandboxing, and bounded memory/CPU/processes. Temporary browser files live in container memory. The backend verifies Docker's effective configuration before starting each worker, limits concurrency, and removes the container on completion or cancellation. Removal is retried and verified through Docker; unconfirmed cleanup returns SCANNER_CLEANUP_FAILED and blocks new workers until absence is confirmed. Leftover fixture or gateway containers, gateway socket volumes, and firewall networks, also block fixture scans after an API restart. Unknown resources are not automatically deleted. Only the fixed `barriers` and `clear` fixture IDs are accepted; URLs, file paths, arbitrary HTML, and extra fields are rejected.

The build context contains only allowlisted worker files. Building downloads dependencies; running fixture scans has no outbound network. The official base image is pinned by digest. The seccomp profile derives from Playwright v1.64.1, with the `chroot` syscall permitted so Chromium can restrict its own filesystem view while container capabilities remain empty. See `scanner/NOTICE.md` for attribution.

These restrictions reduce exposure; they are not a guarantee against all container, browser, or VM vulnerabilities. Public targets remain disabled and need a separately reviewed network-isolation design.

## Architecture

The browser sends `POST /api/analyze` with a JSON URL payload. Vite proxies development requests to Express, which validates the URL and returns a demo report. The API never connects to the submitted website. Reports remain in browser memory and reset on reload.

| Location | Responsibility |
| --- | --- |
| `src/App.tsx` | Page composition, request lifecycle, and shared UI state |
| `src/components/` | Website form, findings report, visual preview, and sample website |
| `src/styles.css` | Responsive layout and interaction styles |
| `server/app.ts` | Express setup, health route, router mounting, and error handling |
| `server/routes/analyze.ts` | Analysis HTTP request and response handling |
| `server/services/analyze.ts` | Demo report generation |
| `server/validation/websiteUrl.ts` | URL input validation |
| `server/index.ts` | Local HTTP listener |
| `server/app.test.ts` | API contract and input-validation tests |
| `server/scanner/` | Fixture and candidate URL policies, shared scanner admission, Docker lifecycle, and report validation |
| `scanner/gateway/` | Unix-socket proxy, frozen destination policy, and controlled proxy tests |
| `server/scanner/fixturePreview.ts` | Bounded fixture snapshot validation and inert HTML serialization |
| `scanner/preview.mjs` | Rendered fixture DOM/style capture in the isolated worker |
| `src/components/SnapshotFrame.tsx` | Opaque, script-free snapshot frames |
| `scanner/firewall/` | Scoped nftables setup, verification, and controlled network fixtures |
| `server/scanner/resources.ts` | Owned container, volume, and network cleanup with fail-closed admission |
| `scanner/` | Narrow container build context, controlled fixtures, and worker-only dependencies |
| `server/scanner.integration.ts` | Real isolated scans, kernel restrictions, and cancellation tests |
| `shared/types.ts` | Shared report interfaces |
| `shared/fixtures.ts` | Fixed fixture identifiers, display names, and identity validation |
| `public/mockups/` | SVG design boards and gallery, available at `/mockups/index.html` |

## API

- `GET /api/health`: reports service status and demo mode.
- `GET /api/scanning-capabilities`: reports public scanning disabled and the candidate allowlist.
- `POST /api/scan-public`: currently returns 503 with `PUBLIC_SCANNING_DISABLED`; no submitted URL is fetched.
- `POST /api/analyze`: accepts `{ "url": "https://example.com" }` and returns sample findings and manual review prompts; no URL fetching.
- `POST /api/preview-fixture`: accepts exactly one `fixture` field: `barriers`, `clear`, or `garden`. Returns a rendered, static snapshot of that built-in page. URL, HTML, path, and extra fields are rejected.
- `POST /api/scan-fixture`: accepts exactly `{ "fixture": "barriers" }` or `{ "fixture": "clear" }` and returns a real fixture report. Invalid input returns 400, a busy scanner returns 429, and an unavailable or failed worker, including unconfirmed cleanup, returns 503. A failed scan never produces a clean accessibility report.

URLs must use HTTP or HTTPS, contain no embedded credentials, and be at most 2,048 characters. Invalid input returns a JSON error with an appropriate HTTP status.

## Actionable accessibility reports

The findings view orders rules by Critical, Serious, Moderate, Minor, then Unknown impact. Severity counts describe rules with violations, not individual elements. The severity selector filters confirmed violations only; **Clear severity filter** restores all findings and returns keyboard focus to the selector. Filters persist across report-tab switches and reset for a newly generated report.

Expand **Affected elements and repair guidance** to inspect each returned selector path beside its own repair summary. Selectors and summaries are rendered as text; they are not executed, used to query the app, or turned into live links. **Checks needing manual review** lists inconclusive checks separately with their own element details. These checks are not counted as confirmed violations or hidden by severity filtering. Empty states distinguish no matching severity, no reported violations, and no inconclusive checks. None of these states establishes accessibility conformance.

Report findings now use this structure, including `scanner.incomplete` entries:

```ts
{
  id: string;
  severity: 'Critical' | 'Serious' | 'Moderate' | 'Minor' | 'Unknown';
  title: string;
  impact: string;
  elements: { targets: string[]; guidance: string }[];
}
```

`elements` replaces the previous flattened `location` and `fix` fields. An empty target list means no selector was supplied; an empty element list receives a manual-review prompt. Worker summaries are validated before mapping, and raw element HTML is omitted. Scanner output is bounded to 100 rules per category and 20 elements per rule; displayed counts describe returned results. Demo findings use the same structure and remain clearly illustrative. Public URL capture and scanning remain disabled.

## Export reports

After generating a report, choose **Download report JSON** or **Print / save as PDF**. In the browser print dialog, select a PDF destination to save a file. Both exports include the full report regardless of the severity filter: source labels, submitted URL or fixture identifier, report timestamp, every returned finding and element guidance, inconclusive checks, manual-check prompts, scanner metadata when available, and scope limitations. Printing includes guidance even when its on-screen disclosure is collapsed. Preview snapshots and vision settings are excluded.

Exports are generated locally from the existing report; they do not trigger scans, capture websites, or upload data. Download filenames use report mode and timestamp. The versioned JSON envelope contains `application: "KindPath"`, `formatVersion: 1`, `source`, and `report`; report fields are explicitly selected rather than copying arbitrary response properties. Text remains text in both formats. The temporary download URL is released when the report changes or is cleared.

Demo exports remain labelled **Illustrative report** and state that the URL was not fetched or assessed. Fixture exports identify the built-in page and remain distinct from checks needing manual review. Zero findings is not a conformance claim. PDF pagination and accessibility tagging depend on the browser; this print feature does not certify an accessible PDF.

## Technology

React, TypeScript, Vite, and Express. Tests use Node's built-in test runner through tsx. The lockfile records resolved dependency versions.

The isolated worker uses Playwright and @axe-core/playwright (including axe-core). No database, authentication, external scanning service, or production deployment is configured. The gateway additionally uses ipaddr.js for IP classification. Public URL scanning and arbitrary website capture remain disabled pending separate review.


## Gateway and firewall verification (public scanning disabled)

The application rejects `POST /api/scan-public` with `PUBLIC_SCANNING_DISABLED`. The candidate allowlist contains only `example.com`; it does not activate scanning. The low-level runner also refuses every public URL, including smoke-test requests. The URL form continues to return demo data.

The prepared browser worker retains `network=none`. Its only gateway connection is a Unix socket in a fresh tmpfs-backed Docker volume, mounted read-only in the browser and read-write in the gateway. No host folder, credentials, or Docker socket are mounted. The gateway exposes no TCP port.

The gateway shares a disposable Linux network namespace with an unprivileged holder container. A short-lived helper receives only `NET_ADMIN` inside that namespace, installs nftables rules, and exits. The controller verifies the rule fingerprint before starting the gateway and again after verification. The gateway and browser receive no network-administration capability. No macOS firewall, Docker daemon firewall setting, or host network namespace is modified.

Kernel rules default to drop for input, output, and forwarding. Only TCP to a fixed IPv4 destination set on ports 80/443 and established replies can pass. IPv6, UDP/DNS, loopback TCP, and all other destinations/ports are denied. The gateway uses a validated immutable address snapshot without runtime DNS lookup. The deny-all verification task still uses an empty snapshot and an isolated network. Additional controlled readiness tasks use injected DNS and fixed internal origins to verify a nonempty pinned plan with an attached egress network; submitted URLs remain rejected.

Controlled firewall fixtures run on a separate internal/isolated Docker network using the benchmarking subnet `198.18.0.0/24`. They first prove the test services are reachable without filtering, then prove that only the approved fixture IP/ports remain reachable after filtering. Probes bypass the Node proxy, inspect kernel drop counters, and verify that an unprivileged process cannot delete the rules. These are synthetic targets, not public sites or services on the host.

```sh
npm run test:gateway:unit # Policy, proxy, serializer, and firewall rule tests without networking
npm run test:gateway      # Browser/socket verification behind the deny-all kernel firewall
npm run test:firewall     # Real kernel TCP/UDP/IPv6 filtering using controlled fixtures
```

Setup or verification failures prevent gateway/browser startup. Container removal and volume/network absence are verified through Docker; unknown orphans block new work without being automatically deleted. A missing kernel feature or helper image causes failure rather than a weaker fallback.

## Container package maintenance

Both image bases are pinned by digest. Image builds fetch Ubuntu updates over authenticated HTTPS, including the APT repair itself. The worker removes global npm/npx and their bundled dependencies after installing its locked application packages. The dedicated helper contains nftables and a Node runtime, with no browser or global npm installation. Neither installs packages at runtime.

Normal Docker builds can reuse package-update layers. To refresh those layers deliberately:

```sh
npm run scanner:build -- --refresh
```

Re-run tests and image vulnerability analysis after a refresh. The November 8, 2026 Scout assessment, **before the source backport described below**, found all 37 previously fixable findings absent from the patched arm64 worker image. Its remaining findings were 1 high, 154 medium, and 18 low; the helper had 14 medium and 2 low. These are historical counts, not a fresh assessment of the current image.

The worker now backports the [upstream GStreamer fix for CVE-2025-3887](https://gstreamer.freedesktop.org/security/sa-2025-0001.html) without Ubuntu Pro/ESM. Removing the affected library prevents WebKit from starting, so the image instead rebuilds only `libgstcodecparsers-1.0.so.0.2402.0` from Ubuntu's authenticated `gst-plugins-bad1.0` source, version `1.24.2-1ubuntu4`. It applies the upstream 1.24 commits [`e4351ef`](https://github.com/GStreamer/gstreamer/commit/e4351ef03f1331410b0c1216a6178d885f37e495) and [`ed4c2ce`](https://github.com/GStreamer/gstreamer/commit/ed4c2ce380f7168bd4a3423f4398eb341cb931c7), each pinned by SHA-256. One missing context comment is restored before patching with zero fuzz; no other parser changes are made.

Compilation and parser tests run without network access, with hardened compiler/linker options. The build requires both upstream H.265 test executables, checks their results, reproduces the missing bounds with a synthetic regression against the original library, and verifies rejection against the patched library. The synthetic counts stay within the original arrays. Exported symbol names must match. Build tools and development headers remain in a disposable stage; the runtime gets the rebuilt library, patch provenance under `/usr/share/doc/libgstreamer-plugins-bad1.0-0/kindpath-patches/`, and its checksum under `/usr/share/kindpath/codec.sha256`. Installation checks the exact original package version and the installed library checksum; an incompatible package refresh fails the build.

This is a local source backport, not a vendor package upgrade. The dpkg package version remains unchanged and its original file checksum differs for this library. Version-based vulnerability scanners can therefore still report this CVE; review the patch, regression evidence and library checksum rather than suppressing findings wholesale. No fresh full image vulnerability assessment has been performed after this backport, and the other historical findings have not been cleared. Existing browser checks exercise DOM scanning, previews and report exports in Chromium, Firefox and WebKit; they do not establish general media playback support or freedom from other codec/browser vulnerabilities.

Public target execution remains disabled. Controller-generated destination plans and verified egress attachment are now exercised with controlled origins; live public DNS, a valid public TLS connection, and submitted-URL execution have not been activated or smoke-tested. Kernel filtering constrains IP/port traffic, not HTTPS paths, methods, or shared-IP virtual hosts. Chromium certificate verification and the proxy/browser request policies remain necessary. Local API Host/Origin checks are development protections rather than production authentication. Container filtering and clean npm audits do not establish browser, kernel, Docker VM, or host safety.


## Allowlisted scan readiness (public access disabled)

`server/scanner/destinationSnapshot.ts` prepares an IPv4-only plan for the exact candidate hostname. It performs one bounded A-record lookup, rejects mixed public/private or special-purpose answers, deduplicates the result, and freezes both the gateway snapshot and firewall address list. The policy conservatively rejects all [IANA special-purpose IPv4 ranges](https://www.iana.org/assignments/iana-ipv4-special-registry/), including globally reachable special-use assignments. The gateway revalidates its snapshot and never performs live DNS.

An owned namespace must have a verified default-drop firewall before egress attachment. The controller creates and inspects a dedicated IPv4 NAT bridge, connects only the holder by its verified container ID, checks the exact network attachments and [gateway priority](https://docs.docker.com/reference/cli/docker/network/connect/), then verifies the firewall again. Gateway/browser startup follows these checks. No host network, host file mount, additional browser/gateway capability, or published port is introduced. Cleanup owns and verifies the new network as well as containers and socket volumes.

`npm run test:gateway` now also exercises the real proxy/browser scanning path using fixed origins at `93.184.216.34` and `.36` on an internal, isolated `93.184.216.32/29` bridge. These public-shaped numbers belong to disposable synthetic services during the test; they are not fetched over the Internet. The egress bridge is attached only after the filter is verified, and the only permitted destination routes directly to the internal origin. Test DNS is injected; no public DNS query is made. Before-filter positive controls prove the canaries exist. After attachment, raw TCP/UDP/IPv6 probes and kernel drop counters prove blocked traffic stays blocked. The ordinary network-none browser then obtains real axe findings through the pinned gateway. Tests cover same-host redirects, forbidden navigation/subresource destinations, rejected POST requests, untrusted TLS certificates, and verified cleanup. Ephemeral test TLS keys are generated and removed in container tmpfs; no certificates or keys are copied from the host or committed.

The controlled tasks are fixed internal selectors, not new API actions. `/api/scan-public` remains disabled, `runPublicWorker` still rejects every URL (including `example.com`), and public capture has no endpoint. Enabling one flag is insufficient to activate public scanning.

**Readiness decision: do not enable public scanning yet.** The targeted GStreamer source backport is described above; it does not clear the rest of the recorded image assessment. No subscription, credentials, risk acceptance, new image scan service, or base-image migration was added. Review of the backport, a refreshed image assessment through a verified free method, a separate public-path security review, and an explicitly authorized `example.com` smoke test remain before activation. Passing controlled tests does not demonstrate host/VM safety or accessibility conformance.

## Fixture snapshot preview

After building the scanner image and starting the app, choose a **Built-in page**, then run an isolated fixture scan. Open **Visual preview**, then choose **Generate fixture snapshot**. The backend renders the same selected fixture in its network-disabled Playwright worker and captures its supported page structure and inline CSS. A demo report instead offers the separate Community garden display fixture, clearly labelled as an illustration. The API validates that structure and serializes a bounded HTML document. It does not accept arbitrary HTML or URLs.

The comparison frames preserve supported CSS, including hover effects and the static advertisement in the garden illustration. Images become inert placeholders; image URLs and data are not included. Anchors have no destinations, form containers become layout groups, and inputs/buttons are disabled. Scripts and unsupported elements/attributes are excluded. Each iframe has an empty sandbox, no same-origin or script permission, and a restrictive content policy that blocks external resources and form submissions. Both panels use the same snapshot; effects apply only to the modified panel. Snapshots stay in browser memory across tab switches; **Refresh fixture snapshot** explicitly requests another capture.

### Vision controls

Colour, contrast reduction, blur, and peripheral restriction have independent 0–100% sliders and can be combined. Colour presets offer illustrative red–green, blue–yellow, and grayscale mixes. These are display effects, not calibrated medical simulations; the percentages do not measure vision loss.

**Mild**, **Moderate**, and **Strong** set all four strengths to 25%, 50%, and 80% respectively, preserve the colour preset, and turn effects on. **Apply visual effects** pauses or restores rendering without losing settings; sliders remain adjustable while paused. **Reset effects** restores red–green at 65% with the other strengths at zero and effects on. Setting all strengths to zero leaves both panels visually unchanged.

Controls support native keyboard interaction and remain outside the modified frame. Adjustments reuse the existing snapshot without requesting a new capture. Settings survive report-tab switches and snapshot refreshes. Starting another analysis, changing the selected page, or reloading clears the report/preview workspace and resets those settings.

Source labels identify the selected fixture in both findings and previews. Scanning and capture are separate requests against the same fixed page; the capture has its own timestamp. Failed capture attempts show a retryable error; an existing snapshot for that same page remains visible if a refresh fails. Changing the selection or starting a new analysis clears old findings, snapshots, and errors, and cancels pending requests. Late responses and mismatched fixture identities cannot populate the new workspace. Docker cleanup may briefly keep the scanner busy after cancellation; retry once cleanup finishes. The capture and serializer support only these fixed fixtures, not general public-site sanitization. Public URL capture and scanning remain disabled.

```sh
npm run build
npm run scanner:build
npm run test:preview # Isolated browser checks for reports and previews
```

The browser check runs Chromium, Firefox, and WebKit inside the existing isolated Docker image, with no host mounts or network access. Only public build assets and generated fixture responses are passed through standard input. It exercises real JSON downloads, complete print output with active filters, download URL cleanup, report sorting/filtering, per-element guidance, manual-review and empty states, demo/fixture reports, matching fixture previews, selection changes with delayed/mismatched responses, loading/failure/retry, hover behavior, disabled navigation/forms, independent and combined visual effects, rendered-image changes, keyboard interaction, presets/pause/reset, refresh/tab persistence, and a 390px layout. Each engine verifies downloads and print-media layout. Chromium additionally produces tagged PDF samples with English language, headings, lists, and an outline; regression checks inspect those markers. This does not certify PDF/UA conformance or control native print-dialog settings. WebKit verification covers the engine, not the Safari application. Screenshots and browser-generated print samples are written to the operating system's temporary directory. No browser is installed or launched on the host.
