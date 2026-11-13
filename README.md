# KindPath

KindPath checks one public webpage for accessibility issues and shows a static visual comparison. It runs locally with an isolated Chromium scanner.

## Run locally

Install Node.js 22.12 or newer and start Docker.

```sh
git clone https://github.com/implexrr/KindPath.git
cd KindPath
npm ci
npm run dev
```

Open [KindPath](http://127.0.0.1:5173/). The first start builds the scanner images. Scanning and capture are enabled by default for local use.

## Scan a page

1. Enter a public website URL and select **Scan website**. Addresses without a scheme default to HTTPS.
2. Open **View report** to inspect findings, filter by severity, or download JSON.
3. Open **Visual preview** to compare the original capture with an educational vision simulation.

The scanner examines the final page only. It follows bounded path and query redirects, a single leading `www.` change, and HTTP-to-HTTPS upgrades. Results record the submitted and final URLs. The report discloses limited coverage and capture failures. Automated findings do not establish accessibility conformance.

Previews use bounded JPEGs from the same scan. Use **Fit width** or **Actual size** to inspect them. Captured forms and links are inactive. Reloading clears the in-memory report. KindPath requires no visitor account or database.

## Checks

```sh
npm test
npm run build
npm run build:production
```

See the [CI workflow](.github/workflows/ci.yml) for the scanner and browser integration checks.

See the [scanner notices](scanner/NOTICE.md) and [codec documentation](scanner/codec/README.md) for third-party attribution and patch details.
