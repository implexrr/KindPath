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

Install and start Docker Desktop on macOS (or a local Docker Engine on Linux), then build the dedicated worker image:

```sh
npm run scanner:build
npm run test:scanner
```

Run the app and choose **Run isolated fixture scan**. A missing engine or image produces an unavailable error; there is no fallback to Chromium on the host. The worker dependencies are locked separately in `scanner/package-lock.json` and are installed inside the image, not in your host browser environment.

The worker runs with networking disabled, no host bind mounts or forwarded credentials, a read-only root filesystem, a non-root user, no container capabilities, Chromium sandboxing, and bounded memory/CPU/processes. Temporary browser files live in container memory. The backend verifies Docker's effective configuration before starting each worker, limits concurrency, and removes the container on completion or cancellation. Removal is retried and verified through Docker; unconfirmed cleanup returns SCANNER_CLEANUP_FAILED and blocks new workers until absence is confirmed. Leftover fixture or gateway containers, and leftover gateway socket volumes, also block fixture scans after an API restart. Unknown resources are not automatically deleted. Only the fixed `barriers` and `clear` fixture IDs are accepted; URLs, file paths, arbitrary HTML, and extra fields are rejected.

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
| `scanner/gateway/` | Unix-socket proxy, pinned destination policy, and controlled proxy tests |
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


## Gateway groundwork (public scanning disabled)

The application rejects POST /api/scan-public with PUBLIC_SCANNING_DISABLED. The candidate allowlist contains only example.com; this does not activate it. Enabling the route is a separate reviewed code change in server/scanner/publicPolicy.ts. The URL form continues to return demo data while the switch is off.

A prepared browser worker still uses network none. Its only gateway connection is a Unix socket in a fresh tmpfs-backed Docker volume, mounted read-only in the browser and read-write in the gateway. This is not a host directory or credential mount. The gateway exposes no TCP port. It validates exact hostnames, standard ports, all DNS answers, and public address ranges, then connects to a pinned numeric IP. Redirect/subresource connections use the same gateway. Chromium retains certificate verification.

The gateway itself has Docker bridge networking and enforces destination rules in Node. It does not have an independent kernel egress firewall. That trust boundary, HTTPS CONNECT handling, browser/VM risks, and runtime/image patch status need security review before activation. CONNECT validates destinations, while the browser layer restricts encrypted HTTP methods and WebSockets; the gateway does not decrypt TLS.

```sh
npm run test:gateway:unit # Policy, proxy, and report tests in a network-disabled container
npm run test:gateway      # Socket isolation, forbidden destinations, cancellation, cleanup
```

The integration suite skips external browsing by default. A separately authorized example.com smoke test can be run with KINDPATH_PUBLIC_SMOKE=1; this never enables the application endpoint. Prepared public reports record blocked/failed resources, omitted rule/element counts when result limits shorten the output, and top-level-only coverage. These limits can affect the findings. Local API Host/Origin checks are development protections, not a production authentication system.

Plain HTTP proxy requests accept only GET/HEAD without a body. Request and response forwarding removes hop-by-hop headers, including headers named by Connection. A client disconnect during DNS resolution prevents a subsequent outbound connection. Controlled proxy tests use only Unix sockets inside a network-disabled container; they cover forwarding, CONNECT success/failure, cancellation, and the request budget.

Before public scanning can be activated, review the independent egress-control design and complete an OS/container-image vulnerability assessment. Passing npm audits covers known JavaScript package advisories; it is not an OS-image scan or a guarantee of safety. The current changes add no production deployment or authentication.
