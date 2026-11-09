# Real website report verification

## Approved scope

Run three anonymous report-only attempts each for `https://github.com/` and `https://designgurus.io/` through the existing local KindPath interface and default isolated scanner. Alternate the targets, without concurrent scans. Keep capture disabled, temporarily enable scanning only for this bounded batch, and restore it afterward. No crawling, login, paid service or deployment is included.

Before activation, verify assessed image identities and absence of owned scanner resources. For each successful response, verify the requested/final URL labels, public report mode, confirmed and inconclusive rule counts, manual-review guidance, report identity and JSON export against that response. For a scan failure, retain only validated stage/code metadata in the public evidence and confirm a clear interface error without a partial or previous report. Confirm scanner resource cleanup before accepting any outcome or starting the next attempt.

Stop on an unexpected API response, report mismatch, policy/isolation violation or unconfirmed cleanup. Do not relax safeguards, raise limits or silently make extra requests to obtain a result. A failure counts as an attempt. After completion or early stop, stop the temporary API after active work settles, restore scanning to false, verify capture remained false, and check a fresh default API rejects public scanning. Keep raw responses and temporary harness artifacts outside the repository.

## Interpretation

The earlier [diagnostic retries](SCAN-FAILURE-DIAGNOSTICS.md) used a pre-fix navigation guard. This batch checks the current implementation; it cannot establish the exact causes of historical failures. Successful reports describe only the anonymously served page at that time, with reported resource omissions. They do not establish site-wide coverage, authenticated-content accessibility, stable findings or conformance.

Status: six approved attempts completed on November 9, 2026. All six reports displayed and matched their JSON exports. Public scanning and capture are disabled again.

## Observed results

Runtime source: `18f53b6` (production code unchanged from `9767de4`), with only scanning temporarily enabled in the local working tree. The three local image tags matched the existing [image assessment](IMAGE-ASSESSMENT.md) before validation. No dependency, image, resource budget, DNS/TLS rule, firewall or container restriction changed.

| Requested URL | Attempt | Final report URL | KindPath API status | Rules with violations | Inconclusive rules | Blocked / failed requests |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| `https://github.com/` | 1 | `https://github.com/` | 200 | 0 | 2 | 56 / 57 |
| `https://designgurus.io/` | 1 | `https://www.designgurus.io/` | 200 | 2 | 1 | 59 / 59 |
| `https://github.com/` | 2 | `https://github.com/` | 200 | 0 | 2 | 37 / 38 |
| `https://designgurus.io/` | 2 | `https://www.designgurus.io/` | 200 | 2 | 1 | 56 / 56 |
| `https://github.com/` | 3 | `https://github.com/` | 200 | 0 | 2 | 58 / 59 |
| `https://designgurus.io/` | 3 | `https://www.designgurus.io/` | 200 | 2 | 1 | 56 / 56 |

All six reports used public mode and matched the requested URL. Final-URL labels correctly handled Design Gurus's redirect to `www.designgurus.io`. Confirmed-rule and inconclusive-rule counts in the interface matched each response, keyboard focus moved to the results, and no preview iframe or captured snapshot appeared. Manual-review guidance was displayed. The JSON export matched each response's request/final URL, timestamp, findings, scanner metadata and manual checks, and retained every server limitation without a snapshot. No previous report or demo data was substituted.

Scanner container, socket-volume and network absence was verified before every response was accepted and before the next attempt. The KindPath interface ran in a network-disabled QA Chromium container with only approved local API calls relayed; it made no external requests. Third-party websites executed only inside the isolated scanner. After the sixth attempt, the temporary API stopped and both source gates were restored to false. Raw reports and temporary harness code remain outside the repository.

## Meaning and limitations

These six attempts demonstrate the current URL-to-report flow for these anonymously served pages. No production change was needed. They do not establish the mechanism of the earlier failures, prove that the History API fix caused these successes, or guarantee future compatibility. Historical evidence remains unchanged in the [original validation](REAL-WEBSITE-VALIDATION.md) and [diagnostic record](SCAN-FAILURE-DIAGNOSTICS.md).

GitHub's zero confirmed violations is not a clean accessibility assessment: each attempt returned two inconclusive rules, and both sites had substantial blocked/failed resource counts. Counts refer to rules, not affected elements or a score. Blocked and failed counts can overlap and should not be added together. Missing resources, anonymous access and page-load timing limit what the reports describe. No inspection established whether the documents were complete homepages, consent states or challenge pages; authenticated content, frames, interaction states and other site pages were not assessed. No broader reliability percentage or site-wide claim follows from three attempts per URL.

## Final checks

All 98 unit/API tests and the TypeScript/Vite production build passed both before and after the live batch. Both npm audits returned zero known vulnerabilities. A fresh default API reported both public capabilities false and rejected public scanning with HTTP 503 / `PUBLIC_SCANNING_DISABLED`. Final daemon queries confirmed no owned fixture/public/QA containers, socket volumes or scanner networks, and the same three assessed image identities.

This branch changes documentation only; no additional unit test or production fix was warranted by these results. The prior 149-test controlled suite and image-vulnerability assessment belong to the preceding diagnostics review, not a newly repeated full suite or image scan on this branch. Remaining image findings are unchanged and documented in the image assessment. Six live attempts were consumed; additional live execution requires approval. Nothing was pushed or purchased.
