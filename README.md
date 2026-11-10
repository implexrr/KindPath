# KindPath

KindPath is being built to accept a website URL, return a single-page accessibility report in JSON, and show an inert static preview with visual-impairment effects. It combines a React interface, an Express API, and isolated Playwright/axe-core workers.

## MVP scope and remaining work

The scope is the exact submitted page, without crawling linked pages. JSON is sufficient for the report. The preview offers simple visual-impairment preset buttons; effects are illustrative approximations.

**Redirect policy:** main-page redirects may only add/remove a single leading `www.` relative to the submitted hostname, upgrade HTTP to HTTPS, or both, while preserving path and query. Reject other host/subdomain changes, path/query changes, HTTPS downgrades and loops with an explanation. Every destination must independently pass existing URL, public DNS/address, destination-pinning and verified-firewall checks before connecting, plus TLS validation for HTTPS; existing redirect/request/time limits remain. Reports retain both submitted and final URLs. The Chromium worker checks each main-document request before connection; the backend and UI also validate the final URL relationship. Loading page resources remains subject to network security controls and is separate from crawling.

The JSON report path and adjustable visual effects already exist. Remaining work centers on useful real-page previews and a separate decision about public activation. The URL-to-report flow has bounded live validation recorded below. Existing report filters and print export are available but do not require further expansion. Public scanning and capture remain disabled pending separate activation approval.

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

The website field accepts addresses such as `example.com` or `example.com/path?query=value`; HTTPS is added when the scheme is omitted. An explicit HTTP or HTTPS scheme is retained. Submission displays the normalized address and uses it for retries. Unsupported schemes, embedded credentials and malformed entries produce an error without a request. This form convenience does not activate scanning or change the backend's public-target policy; direct API callers do not receive hostname-only normalization.

For fixture reports, the visual preview captures the same selected built-in page. Demo reports retain a separate Community garden illustration. Neither captures the submitted URL. Effects are illustrative approximations, not reproductions of an individual's vision or a medical condition.

Automated checks and visual simulations cannot establish accessibility conformance. Keyboard, screen reader, and usability evaluation remain essential.

The request status announces progress, completion and cancellation. **Cancel request** stops waiting and clears pending results; **Try again** repeats the last action only when explicitly selected. Worker creation must finish its bounded Docker command before cancellation cleanup can begin; cleanup can briefly keep the scanner busy after cancellation. Editing the URL or changing the built-in page clears previous results and retry state. Late responses cannot replace the current workspace. Unreadable responses use a fixed message rather than raw parsing diagnostics, and cancellation or failure moves keyboard focus to **Try again**.

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

Install and start Docker Desktop on macOS (or a local Docker Engine on Linux). Firewall verification requires Docker Engine 28 or newer with nftables support. Build the scanner, browser QA and firewall images:

```sh
npm run scanner:build
npm run test:scanner
npm run test:firewall
```

The build produces three fixed roles:

| Target / local tag | Purpose |
| --- | --- |
| `worker` / `kindpath-fixture-scanner:local` | Headless Chromium scanner, fixture previews and prepared gateway/browser workers |
| `qa` / `kindpath-browser-qa:local` | Three-browser UI tests and fixed synthetic TLS origins |
| `firewall` / `kindpath-firewall:local` | Existing minimal namespace/firewall helper |

The scanner starts from pinned Ubuntu and copies only Node, locked packages and the pinned Chromium headless distribution from build stages. Firefox, WebKit and their GStreamer bad-package dependencies stay in QA. QA is never a fallback if the scanner image is missing. Runtime and QA use identical Chromium binaries; all existing isolation restrictions remain enforced.

Run the app, select a **Built-in page** (Garden form with barriers or Labelled garden form), and choose **Scan built-in page**. A missing engine or image produces an unavailable error; there is no fallback to Chromium on the host. The worker dependencies are locked separately in `scanner/package-lock.json` and are installed inside the image, not in your host browser environment.

The worker runs with networking disabled, no host bind mounts or forwarded credentials, a read-only root filesystem, a non-root user, no container capabilities, Chromium sandboxing, and bounded memory/CPU/processes. Temporary browser files live in container memory. The backend verifies Docker's effective configuration before starting each worker, limits concurrency, and removes the container on completion or cancellation. Removal is retried and verified through Docker; unconfirmed cleanup returns SCANNER_CLEANUP_FAILED and blocks new workers until absence is confirmed. Leftover fixture or gateway containers, gateway socket volumes, and firewall networks, also block fixture scans after an API restart. Unknown resources are not automatically deleted. Only the fixed `barriers` and `clear` fixture IDs are accepted; URLs, file paths, arbitrary HTML, and extra fields are rejected.

The build context contains only allowlisted worker files. Building downloads dependencies; running fixture scans has no outbound network. The official base image is pinned by digest. The seccomp profile derives from Playwright v1.65.0, with the `chroot` syscall permitted so Chromium can restrict its own filesystem view while container capabilities remain empty. See `scanner/NOTICE.md` for attribution.

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
| `server/scanner/` | Fixture and public URL policies, shared scanner admission, Docker lifecycle, and report validation |
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
- `GET /api/scanning-capabilities`: reports both disabled capabilities and `urlPolicy: "public-http-https"`. This policy describes prepared URL eligibility, not activation.
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

The application rejects `POST /api/scan-public` with `PUBLIC_SCANNING_DISABLED`. The prepared policy accepts public HTTP/HTTPS hostnames on standard ports; it does not activate scanning. The URL runner also refuses every public URL while the gate is false, including smoke-test requests. The separate verification runner accepts only fixed internal tasks. The URL form continues to return demo data.

The prepared browser worker retains `network=none`. Its only gateway connection is a Unix socket in a fresh tmpfs-backed Docker volume, mounted read-only in the browser and read-write in the gateway. No host folder, credentials, or Docker socket are mounted. The gateway exposes no TCP port.

The gateway shares a disposable Linux network namespace with an unprivileged holder container. A short-lived helper receives only `NET_ADMIN` inside that namespace, installs nftables rules, and exits. The controller verifies the rule fingerprint before starting the gateway and again after verification. The gateway and browser receive no network-administration capability. No macOS firewall, Docker daemon firewall setting, or host network namespace is modified.

Kernel rules default to drop for input, output, and forwarding. Only TCP to the controller-approved IPv4 destination set on ports 80/443 and established replies can pass. IPv6, UDP/DNS, loopback TCP, and all other destinations/ports are denied. The gateway never performs DNS. The controller pins one immutable answer per host and scan. Before granting a new redirect or resource host, it rejects every private/special-purpose answer, verifies the old firewall fingerprint, atomically replaces the destination union, and verifies the new policy. Only then does the gateway receive the numeric addresses. Approvals use bounded JSON over the owned gateway's Docker stdin/stdout, with no host-file mount or listening host port. The deny-all verification task still uses an empty snapshot and an isolated network. Additional controlled readiness tasks use injected DNS and fixed internal origins to verify a nonempty pinned plan with an attached egress network; submitted URLs remain rejected.

Controlled firewall fixtures run on a separate internal/isolated Docker network using the benchmarking subnet `198.18.0.0/24`. They first prove the test services are reachable without filtering, then prove that only the approved fixture IP/ports remain reachable after filtering. Probes bypass the Node proxy, inspect kernel drop counters, and verify that an unprivileged process cannot delete the rules. These are synthetic targets, not public sites or services on the host.

```sh
npm run test:gateway:unit # Policy, proxy, serializer, and firewall rule tests without networking
npm run test:gateway      # Browser/socket verification behind the deny-all kernel firewall
npm run test:firewall     # Real kernel TCP/UDP/IPv6 filtering using controlled fixtures
```

Setup or verification failures prevent gateway/browser startup. Container removal and volume/network absence are verified through Docker; unknown orphans block new work without being automatically deleted. A missing kernel feature or helper image causes failure rather than a weaker fallback.

## Container package maintenance

The image bases are pinned by digest. Builds fetch signed Ubuntu updates over authenticated HTTPS, including the APT repair itself. The scanner copies Node and its locked JavaScript/browser files from disposable build sources, installs Chromium-only system dependencies and package-managed CA certificates, and contains no npm or compiler. QA retains the multi-browser setup and removes global npm/npx. The dedicated helper contains nftables and Node without a browser or global npm. None installs packages at runtime.

Normal Docker builds can reuse package-update layers. To refresh those layers deliberately:

```sh
npm run scanner:build -- --refresh
```

Re-run tests and image vulnerability analysis after a refresh. The November 8, 2026 Scout assessment, **before the source backport described below**, found all 37 previously fixable findings absent from the former combined arm64 worker image. Its remaining findings were 1 high, 154 medium, and 18 low; the helper had 14 medium and 2 low. These are historical counts, not a fresh assessment of the current image.

The QA image retains the backport of the [upstream GStreamer fix for CVE-2025-3887](https://gstreamer.freedesktop.org/security/sa-2025-0001.html) without Ubuntu Pro/ESM. Removing the affected library prevents WebKit from starting, so the image instead rebuilds only `libgstcodecparsers-1.0.so.0.2402.0` from Ubuntu's authenticated `gst-plugins-bad1.0` source, version `1.24.2-1ubuntu4`. It applies the upstream 1.24 commits [`e4351ef`](https://github.com/GStreamer/gstreamer/commit/e4351ef03f1331410b0c1216a6178d885f37e495) and [`ed4c2ce`](https://github.com/GStreamer/gstreamer/commit/ed4c2ce380f7168bd4a3423f4398eb341cb931c7), each pinned by SHA-256. One missing context comment is restored before patching with zero fuzz; no other parser changes are made.

Compilation and parser tests run without network access, with hardened compiler/linker options. The build requires both upstream H.265 test executables, checks their results, reproduces the missing bounds with a synthetic regression against the original library, and verifies rejection against the patched library. The synthetic counts stay within the original arrays. Exported symbol names must match. Build tools and development headers remain in a disposable stage; the runtime gets the rebuilt library, patch provenance under `/usr/share/doc/libgstreamer-plugins-bad1.0-0/kindpath-patches/`, and its checksum under `/usr/share/kindpath/codec.sha256`. Installation checks the exact original package version and the installed library checksum; an incompatible package refresh fails the build.

This is a local source backport, not a vendor package upgrade. The dpkg package version remains unchanged and its original file checksum differs for this library. Version-based vulnerability scanners can therefore still report this CVE; review the patch, regression evidence and library checksum rather than suppressing findings wholesale. The November 9, 2026 Playwright/image update removed all 249 previously fixable Firefox matches in the local Grype database. After separating the images, the scanner runtime has zero critical/high matches and passes the raw high-severity threshold; QA retains seven high matches and a newer Mozilla advisory requiring follow-up. See [the role-specific assessment](scanner/IMAGE-ASSESSMENT.md). The scanner does not ship these Firefox/WebKit components or the custom codec repair. Existing browser checks exercise DOM scanning, previews and report exports in Chromium, Firefox and WebKit; they do not establish general media playback support or freedom from other codec/browser vulnerabilities.

Public target execution remains disabled. Controller-generated destination plans and verified egress attachment are exercised with controlled origins. Five approved report-only live attempts subsequently produced three displayed reports and two unresolved failures; the validation records are linked below. Kernel filtering constrains IP/port traffic, not HTTPS paths, methods, or shared-IP virtual hosts. Chromium certificate verification and the proxy/browser request policies remain necessary. Local API Host/Origin checks are development protections rather than production authentication. Container filtering and clean npm audits do not establish browser, kernel, Docker VM, or host safety.


## Public destination readiness (public access disabled)

`server/scanner/destinationSnapshot.ts` prepares an IPv4-only plan for each eligible hostname. It performs one bounded A-record lookup, rejects mixed public/private or special-purpose answers, deduplicates the result, and freezes both the gateway snapshot and firewall address list. The policy conservatively rejects all [IANA special-purpose IPv4 ranges](https://www.iana.org/assignments/iana-ipv4-special-registry/), including globally reachable special-use assignments. The gateway revalidates its snapshot and never performs live DNS.

An owned namespace must have a verified default-drop firewall before egress attachment. The controller creates and inspects a dedicated IPv4 NAT bridge, connects only the holder by its verified container ID, checks the exact network attachments and [gateway priority](https://docs.docker.com/reference/cli/docker/network/connect/), then verifies the firewall again. Gateway/browser startup follows these checks. No host network, host file mount, additional browser/gateway capability, or published port is introduced. Cleanup owns and verifies the new network as well as containers and socket volumes.

`npm run test:gateway` now also exercises the real proxy/browser scanning path using fixed origins at `93.184.216.34` and `.36` on an internal, isolated `93.184.216.32/29` bridge. These public-shaped numbers belong to disposable synthetic services during the test; they are not fetched over the Internet. The egress bridge is attached only after the filter is verified, and permitted public-shaped fixture IPs route directly to internal origins. Test DNS is injected; no public DNS query is made. Before-filter positive controls prove the canaries exist. After attachment, raw TCP/UDP/IPv6 probes and kernel drop counters prove blocked traffic stays blocked. The ordinary network-none browser then obtains real axe findings through the pinned gateway. Tests cover same-host redirects, forbidden navigation/subresource destinations, rejected POST requests, untrusted TLS certificates, and verified cleanup. Ephemeral test TLS keys are generated and removed in container tmpfs; no certificates or keys are copied from the host or committed.

The controlled tasks are fixed internal selectors, not new API actions. `/api/scan-public` remains disabled and `runPublicWorker` still rejects every URL (including `example.com`). Public capture has no standalone endpoint and its prepared combined scan path is independently disabled. There is no HTTP or environment setting for activation; enabling public execution remains a separately reviewed code change.

**Ongoing public activation remains unapproved.** The Chromium runtime and firewall helper pass the current image high-severity threshold. QA findings remain recorded and scoped to controlled testing; a passing runtime assessment is not an automatic activation decision or a safety guarantee. Review the [role-specific evidence](scanner/IMAGE-ASSESSMENT.md) and the enabled path before requesting approval for any further live execution. The completed five-attempt validation did not authorize ongoing activation. Public capture and scanning remain false. No subscription, credentials, paid operation or risk acceptance was added.

## Single-page MVP validation

The [validation record](scanner/MVP-VALIDATION.md) documents one earlier, explicitly approved example.com scan and subsequent offline UI verification. Both gates were restored afterward. The subsequent [report-only validation](scanner/REAL-WEBSITE-VALIDATION.md) exercised Google, GitHub, Martin Fowler, Design Gurus and Instagram once each: three reports displayed, while GitHub and Design Gurus failed with undiagnosed `SCAN_FAILED` responses. A later [six-attempt report verification](scanner/REPORT-VERIFICATION.md) returned reports for GitHub and Design Gurus three times each, with significant resource omissions. This establishes limited live compatibility, not support for every site. Further live requests and continuing activation require separate approval. No hosting is configured.

## Gated URL-to-report path

The prepared URL path accepts public DNS hostnames over HTTP/HTTPS on standard ports, with no credentials or fragments. Numeric IPs, single-label/local/reserved hostnames and private/special-purpose DNS answers are rejected. Only IPv4-reachable pages are supported; IPv6-only and sign-in-protected pages are unsupported. **Public scanning and capture remain disabled.** The default router, report service and URL runner each check the same disabled policy; tests use separate dependency-injected instances, never request parameters or environment overrides. “Try an example” always requests demo findings, even if public scanning becomes available in a future release.

`publicUrlWorker.ts` validates the URL before opening Docker or resolving DNS. After obtaining shared scan admission and checking for orphaned resources, it creates a fresh, validated DNS destination plan inside the 60-second orchestration budget. Each DNS lookup is independently bounded to five seconds. The gateway allows up to 55 seconds for the queued controller approval, including firewall verification, within the existing overall deadline; it does not apply the DNS-only timeout to that entire operation. No network or browser is created for rejected DNS answers or a mismatched plan. It then prepares an owned internal namespace, installs and verifies the firewall, attaches verified egress, and calls the same gateway/browser transport used by controlled verification. Each additional redirect or resource hostname is approved through the same validation and verified firewall update before connection. At most 16 hosts (including failed lookups) and 64 distinct IPv4 addresses are admitted per scan. Each host is looked up once and its result is cached, preventing a later DNS rebind. Host/IP budgets, 100 browser requests, bounded proxy connections and byte limits, and the existing deadlines can omit resources or fail a page. The numeric address plans are shared by the firewall and gateway; the browser has no external interface. Verified cleanup completes before output is mapped into an API report. Cancellation and failures never return partial results or raw DNS/browser/Docker diagnostics. The worker records the analyzed URL and rejects results when a main-document request, URL change or document-identity change is detected during analysis. Same-URL History API updates alone do not invalidate an unchanged document.

A successful prepared report uses `mode: "public"`, `requestedUrl` for the normalized request, and `url` for the final permitted public page after redirects. The screen, JSON export and printable report distinguish those URLs. The UI shares the public URL syntax and single-page navigation validators, accepts only the original hostname or its single `www.` counterpart with an optional HTTPS upgrade and unchanged path/query, and rejects a mismatched request or report mode. Changing the built-in selection cancels pending work. While public capture is disabled, public reports offer only the clearly separate built-in illustration. The prepared same-visit capture path is described below.

Checks cover the HTTP contract, disabled defaults, rejected targets/answers, shared admission during DNS waiting, cancellation, invalid worker output and generic failures. The controlled HTTP integration test runs the real URL controller, proxy/browser and axe against internal synthetic origins with injected DNS. Browser UI checks mock capability/API responses entirely inside network-none containers. Those controlled suites do not visit public sites; the separately approved live attempts are recorded above. Permitted `www` redirects, rejected unrelated-host/path/query redirects, loops, script/meta navigation, external CSS and scripts, private DNS answers, one-lookup pinning and atomic firewall updates are exercised with synthetic services on an isolated internal subnet. Further live validation and activation require separate approval and review of the [image findings](scanner/IMAGE-ASSESSMENT.md); committed execution remains disabled.

## Single-page redirect handling

Main-page navigation permits only adding/removing one leading `www.` relative to the submitted hostname, HTTP-to-HTTPS upgrades, or both, with serialized path/query unchanged, including the distinction between no query and an empty `?` query. Other host changes, path/query changes, HTTPS downgrades and loops fail without a report. This includes navigation initiated by scripts or meta refresh. Every permitted host still requires independent destination approval; HTTPS certificates must validate. Resource requests retain their existing security rules and do not expand the report into a crawl.

The worker uses a separate Chromium DevTools interception session to check main-document requests before connection, including intermediate HTTP redirect hops. It retains Playwright routing for other request restrictions and rejects a result if interception fails or its session closes during the scan. Navigation has a ten-document-request cap within the existing request/time budgets. The backend and UI independently check the final URL relationship; existing analysis/capture document-change guards remain.

Redirect failures retain HTTP 503 / `SCAN_FAILED` with a bounded diagnostic and a fixed explanation for invalid destinations, host changes, path/query changes, downgrades, repeated navigation URLs or the navigation limit. No raw redirect destination or native error is included in those explanations. Unconfirmed resource cleanup still takes precedence over the redirect failure. Successful reports retain both `requestedUrl` and `url`. Both public capabilities remain disabled. Controlled fixtures cover the www/rejection boundaries; the limited live observations are recorded below.

The [three approved report-only validation attempts](scanner/REDIRECT-VALIDATION.md) each returned a report that displayed correctly and matched its JSON download payload: Example Domain, an HTTP GitHub input with an HTTPS final URL, and Martin Fowler. GitHub had substantial resource omissions; these results do not establish complete page coverage, conformance or general compatibility. No preview was captured. Both public capabilities were restored to disabled, so ordinary URL entry still returns labelled demo data until activation is separately approved.

## Scan coverage feedback

Prepared public reports show a coverage notice above the findings and exports. It distinguishes blocked/failed requests from rules or affected elements omitted by result limits; blocked and failed request counts may overlap. Missing resources can change findings, and a zero-count notice does not promise complete coverage or accessibility conformance. Missing or malformed coverage data is shown as unavailable. Demo and fixture reports do not receive this public-coverage notice.

Public report responses and JSON exports include an optional `coverage` object containing only validated nonnegative safe-integer `blockedRequests`, `failedRequests`, `omittedRules` and `omittedNodes` counts. The print view repeats the same notice. Existing limitations remain included, and no extra scan is requested. Both public scanning and capture remain disabled; browser checks use controlled responses inside network-disabled containers.

## Safe scan failure diagnostics

A failed scan can return an optional allowlisted stage/code and, for a rejected main-page response, its HTTP status. Raw internal errors and sensitive details are excluded; the interface retains its existing error message. [Diagnostic retries](scanner/SCAN-FAILURE-DIAGNOSTICS.md) recorded navigation-guard rejection during accessibility analysis for GitHub and Design Gurus. A controlled same-URL History API false positive is fixed, while real reloads and changed documents remain rejected. A subsequent [report verification](scanner/REPORT-VERIFICATION.md) returned and displayed reports on all three approved retries per site, including matching JSON exports. Resource omissions limit those results, and the original failure causes remain unknown. Both public features are disabled; further live execution requires approval.

## Real website preview validation

A [twenty-site local validation](scanner/WEBSITE-PREVIEW-VALIDATION.md) completed one explicitly approved anonymous scan-and-capture attempt per homepage. Sixteen returned reports and snapshots with matching identities; four failed without partial results. The returned captures passed isolation, effect-control and report/export checks, but six contained no rendered text and others were sparse. These results validate observed boundaries and flow, not broadly useful preview fidelity. Both public features were restored to disabled; further live execution requires approval.

## Preview content quality

Prepared website capture retains ordinary `b`, `i`, `pre`, `code` and `time` text markup. Component hosts with rendered light-DOM content become inert `div`/`span` wrappers; their source tag names, event handlers and resource attributes are not copied. Shadow-tree content is not traversed, and unrendered light content behind the controlled shadow-root cases is excluded. Body background, text colour, spacing and supported typography pass through the same bounded CSS validation as descendant styles.

Controlled fixtures verify recognizable component text, code formatting and a dark page's light-text contrast. Images/media and unsupported content remain omitted, and the existing capture budgets and inert iframe restrictions are unchanged. These fixes have not been retried on public sites and do not establish general visual fidelity. See [the retention record](scanner/CONTENT-RETENTION.md).

## Preview content retention

The capture skips short, collapsible formatting whitespace beside supported block elements that pass the existing visibility checks so indentation does not crowd later text out of the existing node budget. Spacing near omitted or hidden content, inline separators, preformatted whitespace, nonbreaking spaces and spacing beside out-of-flow elements are preserved. A [controlled regression](scanner/CONTENT-RETENTION.md) now retains a later heading; a larger fixture still truncates at the existing limit. No resource budget or allowed content was expanded, and no live-site improvement is claimed. Public scanning and capture remain disabled.

## Preview quality feedback

The prepared public-preview view uses a text-based hint derived from accepted snapshot nodes on the backend. With no non-whitespace text, it shows **Website preview unavailable** and hides the empty panels and effect controls. Findings, JSON exports and print remain available. A count of 1–99 non-whitespace text units produces a caution while keeping the preview and its controls available: a page can legitimately be short. Missing or malformed hint data is shown as unknown, without rejecting an otherwise matching report.

The count measures captured text, not rendered visibility, layout fidelity or accessibility. More text does not establish a useful preview; content may be clipped, off-screen or omitted. No iframe access or permission change, extra scan, live retry or capture-budget increase is involved. Demo and fixture previews are unchanged. Public scanning and capture remain disabled; checks use controlled fixtures only.

## Same-visit website snapshots (disabled)

`PUBLIC_CAPTURE_ENABLED` and `PUBLIC_SCANNING_ENABLED` are both `false`. Capabilities report `publicCaptureEnabled: false`; no request field or environment variable enables capture. The prepared capture is an optional part of the existing scan operation, not a separate URL-fetching endpoint. Ordinary scans do not collect snapshot data.

When separately enabled in a controlled test instance, the worker runs axe and then captures a bounded structural approximation from that same browser page, without another navigation or network visit. A main-document request, URL change or document-identity change during analysis or capture invalidates the result. Capture occurs after analysis, so dynamic content can still differ between the two steps. The worker transfers structured nodes and selected visual properties rather than source HTML or raw stylesheet text. The backend independently validates tags, attributes, CSS property/value pairs, depth, sizes and final URL before constructing the preview document. Scripts, frames, media, image URLs, form values, custom fonts and unsupported structure/styles are omitted. Images become text placeholders. Only simple link/button hover rules from readable top-level stylesheets are supported; advertisement text can remain, while embedded advertisements and tracking are excluded. Counts and limitations describe the approximation.

The prepared worker waits for the initial page `load` event within its existing 15-second navigation deadline, then analyzes and captures one page at the browser’s scan viewport. It does not wait for network silence, scroll the entire page, sign in, handle consent dialogs, or crawl links. Later content and blocked third-party resources can change the result. Article headings, figures, definition lists and ordinary tables are supported; bounded table spans and header scopes are preserved. Hidden subtrees are omitted. A narrower preview panel displays the captured layout rather than re-running the site's responsive layout.

Controlled compatibility checks cover a redirecting page, an informational article/table with a delayed same-host stylesheet, a form with intentional accessibility barriers, and a missing page. Failed main-page loads produce no report; unsupported snapshot content stays omitted. These cases use internal synthetic origins with injected DNS, not public sites.

Source traversal stops at 1,000 visited nodes, 250 captured nodes, depth 15, 8,000 text characters and a 20,000-character declaration budget. Stylesheet inspection is limited to 20 sheets and 500 rules. The host independently limits nodes/depth/text/CSS and rejects documents over 100,000 characters. Excessive or malformed captures fail with a generic scan error after verified resource cleanup; no partial report or raw diagnostics are returned.

The service assigns a fresh `scanId` to the report and its optional `sitePreview`, binding that preview to both `requestedUrl` and the final `url`. The UI requires the same identity and current capture capability before displaying it. Another scan clears the previous report and creates a new comparison with reset vision settings. Both frames reuse the existing empty iframe sandbox, opaque origin, no-referrer policy and restrictive content policy. Links have no destinations, forms become layout groups, and inputs/buttons are disabled. Report JSON and print exports exclude captured HTML and the ephemeral scan identifier.

Controlled HTTP tests verify real same-visit scanning/capture against internal origins, including script-rendered text, safe hover styling, a static advertisement, omitted form values and verified cleanup. Network-disabled Chromium, Firefox and WebKit checks exercise comparison controls, inactive navigation, opaque-frame isolation, stale identity rejection and export exclusion. No real public site or public DNS lookup is part of these tests. Public activation still requires review of the remaining browser/image concerns and the expanded destination path, plus explicit approval for a bounded live validation. No dependencies, external services or paid commitments were added.

## Fixture snapshot preview

After building the scanner image and starting the app, choose a **Built-in page**, then run an isolated fixture scan. Open **Visual preview**, then choose **Generate fixture snapshot**. The backend renders the same selected fixture in its network-disabled Playwright worker and captures its supported page structure and inline CSS. A demo report instead offers the separate Community garden display fixture, clearly labelled as an illustration. The API validates that structure and serializes a bounded HTML document. It does not accept arbitrary HTML or URLs.

The comparison frames preserve supported CSS, including hover effects and the static advertisement in the garden illustration. Images become inert placeholders; image URLs and data are not included. Anchors have no destinations, form containers become layout groups, and inputs/buttons are disabled. Scripts and unsupported elements/attributes are excluded. Each iframe has an empty sandbox, no same-origin or script permission, and a restrictive content policy that blocks external resources and form submissions. Both panels use the same snapshot; effects apply only to the modified panel. Snapshots stay in browser memory across tab switches; **Refresh fixture snapshot** explicitly requests another capture.

### Vision controls

**Original**, **Red–green colour vision**, **Blue–yellow colour vision**, **Blurred vision**, and **Reduced peripheral vision** provide one-click starting points. Original clears all strengths; the colour presets use 65% colour with other effects off, blur uses 50% blur only, and peripheral restriction uses 65% peripheral only. Selecting a preset turns effects on and replaces the current strengths. The selected button follows the applied settings; paused or custom combinations have no active vision preset. Controls remain available for further adjustment.

Colour, contrast reduction, blur, and peripheral restriction have independent 0–100% sliders and can be combined. Colour presets offer illustrative red–green, blue–yellow, and grayscale mixes. These are display effects, not calibrated medical simulations; the percentages do not measure vision loss.

**Mild**, **Moderate**, and **Strong** set all four strengths to 25%, 50%, and 80% respectively, preserve the colour preset, and turn effects on. **Apply visual effects** pauses or restores rendering without losing settings; sliders remain adjustable while paused. **Reset effects** restores red–green at 65% with the other strengths at zero and effects on. Setting all strengths to zero leaves both panels visually unchanged.

Controls support native keyboard interaction and remain outside the modified frame. Adjustments reuse the existing snapshot without requesting a new capture. Settings survive report-tab switches and snapshot refreshes. Starting another analysis, changing the selected page, or reloading clears the report/preview workspace and resets those settings.

Source labels identify the selected fixture in both findings and previews. Scanning and capture are separate requests against the same fixed page; the capture has its own timestamp. Failed capture attempts show a retryable error; an existing snapshot for that same page remains visible if a refresh fails. Changing the selection or starting a new analysis clears old findings, snapshots, and errors, and cancels pending requests. Late responses and mismatched fixture identities cannot populate the new workspace. Docker cleanup may briefly keep the scanner busy after cancellation; retry once cleanup finishes. The capture and serializer support only these fixed fixtures, not general public-site sanitization. Public URL capture and scanning remain disabled.

```sh
npm run build
npm run scanner:build
npm run test:preview # Isolated browser checks for reports and previews
```

The browser check runs Chromium, Firefox, and WebKit inside the separate QA image, with the existing isolation checks and no host mounts or network access. Only public build assets and generated fixture responses are passed through standard input. It exercises real JSON downloads, complete print output with active filters, download URL cleanup, report sorting/filtering, per-element guidance, manual-review and empty states, demo/fixture reports, matching fixture previews, selection changes with delayed/mismatched responses, loading/failure/retry, hover behavior, disabled navigation/forms, independent and combined visual effects, rendered-image changes, keyboard interaction, presets/pause/reset, refresh/tab persistence, and a 390px layout. Each engine verifies downloads and print-media layout. Chromium additionally produces tagged PDF samples with English language, headings, lists, and an outline; regression checks inspect those markers. This does not certify PDF/UA conformance or control native print-dialog settings. WebKit verification covers the engine, not the Safari application. Screenshots and browser-generated print samples are written to the operating system's temporary directory. No browser is installed or launched on the host.
