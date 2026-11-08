# KindPath

KindPath explores website accessibility through automated checks, actionable example findings, and side-by-side visual comparisons. It combines a React interface, an Express API, and an isolated Playwright/axe-core fixture worker.

## Features

- Website URL submission with server-side validation and clear error messages.
- Real axe-core checks on two controlled fixtures, with violations separated from checks needing review.
- Example accessibility findings with severity, impact, and suggested improvements.
- Side-by-side previews with adjustable colour, contrast, blur, and peripheral field effects.
- A fictional preview website with hover styles, disabled navigation, and a static advertisement placeholder.
- Manual review prompts alongside automated-testing guidance.
- Responsive layouts and standalone design mockups.

## Current capabilities

**Public URL scanning is disabled.** The URL form returns illustrative demo findings and never fetches the submitted website. The separate isolated-fixture action runs real axe-core checks on a built-in example. It does not scan the submitted URL.

The visual preview always displays an included fictional website, independently of the report. Effects are illustrative approximations, not reproductions of an individual's vision or a medical condition.

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
npm test       # Run HTTP contract and validation tests
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

Run the app and choose **Run isolated fixture scan**. A missing engine or image produces an unavailable error; there is no fallback to Chromium on the host. The worker dependencies are locked separately in `scanner/package-lock.json` and are installed inside the image, not in your host browser environment.

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
| `scanner/firewall/` | Scoped nftables setup, verification, and controlled network fixtures |
| `server/scanner/resources.ts` | Owned container, volume, and network cleanup with fail-closed admission |
| `scanner/` | Narrow container build context, controlled fixtures, and worker-only dependencies |
| `server/scanner.integration.ts` | Real isolated scans, kernel restrictions, and cancellation tests |
| `shared/types.ts` | Shared report interfaces |
| `public/mockups/` | SVG design boards and gallery, available at `/mockups/index.html` |

## API

- `GET /api/health`: reports service status and demo mode.
- `GET /api/scanning-capabilities`: reports public scanning disabled and the candidate allowlist.
- `POST /api/scan-public`: currently returns 503 with `PUBLIC_SCANNING_DISABLED`; no submitted URL is fetched.
- `POST /api/analyze`: accepts `{ "url": "https://example.com" }` and returns sample findings and manual review prompts; no URL fetching.
- `POST /api/scan-fixture`: accepts exactly `{ "fixture": "barriers" }` or `{ "fixture": "clear" }` and returns a real fixture report. Invalid input returns 400, a busy scanner returns 429, and an unavailable or failed worker, including unconfirmed cleanup, returns 503. A failed scan never produces a clean accessibility report.

URLs must use HTTP or HTTPS, contain no embedded credentials, and be at most 2,048 characters. Invalid input returns a JSON error with an appropriate HTTP status.

## Technology

React, TypeScript, Vite, and Express. Tests use Node's built-in test runner through tsx. The lockfile records resolved dependency versions.

The isolated worker uses Playwright and @axe-core/playwright (including axe-core). No database, authentication, external scanning service, or production deployment is configured. The gateway additionally uses ipaddr.js for IP classification. Public URL scanning and arbitrary website capture remain disabled pending separate review.


## Gateway and firewall verification (public scanning disabled)

The application rejects `POST /api/scan-public` with `PUBLIC_SCANNING_DISABLED`. The candidate allowlist contains only `example.com`; it does not activate scanning. The low-level runner also refuses every public URL, including smoke-test requests. The URL form continues to return demo data.

The prepared browser worker retains `network=none`. Its only gateway connection is a Unix socket in a fresh tmpfs-backed Docker volume, mounted read-only in the browser and read-write in the gateway. No host folder, credentials, or Docker socket are mounted. The gateway exposes no TCP port.

The gateway shares a disposable Linux network namespace with an unprivileged holder container. A short-lived helper receives only `NET_ADMIN` inside that namespace, installs nftables rules, and exits. The controller verifies the rule fingerprint before starting the gateway and again after verification. The gateway and browser receive no network-administration capability. No macOS firewall, Docker daemon firewall setting, or host network namespace is modified.

Kernel rules default to drop for input, output, and forwarding. Only TCP to a fixed IPv4 destination set on ports 80/443 and established replies can pass. IPv6, UDP/DNS, loopback TCP, and all other destinations/ports are denied. The gateway uses a validated immutable address snapshot without runtime DNS lookup. During the current verification phase its snapshot is empty, its network is internal/isolated, and no outbound network is attached.

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

Re-run tests and image vulnerability analysis after a refresh. On November 8, 2026, Scout found all 37 previously fixable findings absent from the patched arm64 worker image. Remaining findings were 1 high, 154 medium, and 18 low; the helper had 14 medium and 2 low. Scout listed no available fixes for those remaining findings at scan time. The high worker finding concerns GStreamer (`CVE-2025-3887`); runtime exploitability has not been established or accepted.

Public target execution remains disabled pending review of those findings and a separately tested controller-generated public DNS snapshot plus outbound-network attachment. Kernel filtering constrains IP/port traffic, not HTTPS paths, methods, or shared-IP virtual hosts. Chromium certificate verification and the proxy/browser request policies remain necessary. Local API Host/Origin checks are development protections rather than production authentication. Container filtering and clean npm audits do not establish browser, kernel, Docker VM, or host safety.
