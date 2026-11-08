# KindPath

KindPath explores website accessibility through actionable example findings and side-by-side visual comparisons. It combines a React interface with an Express API and adjustable effects that illustrate potential visual barriers.

## Features

- Website URL submission with server-side validation and clear error messages.
- Example accessibility findings with severity, impact, and suggested improvements.
- Side-by-side previews with adjustable colour, contrast, blur, and peripheral field effects.
- A fictional preview website with hover styles, disabled navigation, and a static advertisement placeholder.
- Manual review prompts alongside automated-testing guidance.
- Responsive layouts and standalone design mockups.

## Current capabilities

**Reports currently use fixed sample findings. Submitted websites are not fetched, scanned, or reproduced.** The preview always displays an included fictional website. Visual effects are illustrative approximations, not reproductions of an individual's vision or a medical condition.

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
| `shared/types.ts` | Shared report interfaces |
| `public/mockups/` | SVG design boards and gallery, available at `/mockups/index.html` |

## API

- `GET /api/health`: reports service status and demo mode.
- `POST /api/analyze`: accepts `{ "url": "https://example.com" }` and returns sample findings and manual review prompts.

URLs must use HTTP or HTTPS, contain no embedded credentials, and be at most 2,048 characters. Invalid input returns a JSON error with an appropriate HTTP status.

## Technology

React, TypeScript, Vite, and Express. Tests use Node's built-in test runner through tsx. The lockfile records resolved dependency versions.

No database, authentication, external scanning service, or production deployment is configured. Live scanning and arbitrary website capture require additional network isolation and untrusted-content controls before implementation.
