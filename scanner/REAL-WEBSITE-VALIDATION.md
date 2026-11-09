# Report-only real website validation

Status: five approved attempts completed on November 9, 2026; three reports displayed and two scans failed. Both public capabilities are disabled again. The two compatibility failures remain unresolved.

## Scope

Validate the existing URL-to-report flow, using anonymous sessions and one attempt per approved HTTPS homepage:

- `https://google.com/`
- `https://github.com/`
- `https://martinfowler.com/`
- `https://designgurus.io/`
- `https://instagram.com/`

Temporarily enable only `PUBLIC_SCANNING_ENABLED` in the local working tree. Keep `PUBLIC_CAPTURE_ENABLED` false throughout. Use the default local API and existing isolated scanner, including approved public redirects/resources and current limits. No crawl, sign-in, retries, policy bypass, paid service or deployment is part of this validation. The earlier snapshot smoke is recorded separately in [MVP-VALIDATION.md](MVP-VALIDATION.md).

## Acceptance and restoration

1. Verify assessed images and absence of owned leftover resources before activation.
2. Submit each exact URL through the KindPath interface once. Check a successful public report's request/final URL labels, displayed findings or honest empty state, manual-review guidance and resource limitations. A served landing/login/challenge page is not evidence about authenticated content or the entire site.
3. Confirm scanner resource cleanup before accepting each result. On failure, require a clear error and no partial report. Stop on policy, isolation or unconfirmed-cleanup failure; do not weaken safeguards to obtain a result.
4. After every outcome, stop the temporary API after active work and cleanup settle, restore scanning to false, and confirm capture stayed false. Start a fresh default API and check both disabled capabilities and HTTP 503 / `PUBLIC_SCANNING_DISABLED`. Verify resource absence separately.
5. Record sanitized outcomes and checks. Keep raw responses, screenshots, temporary activation code and local paths outside committed files. Further attempts require approval; a failed attempt must not be presented as successful validation.


## Observed results

Runtime source: `7f939e3`, with only scanning temporarily enabled in the working tree. The scanner, QA and firewall tags matched the existing [image assessment](IMAGE-ASSESSMENT.md) before and after validation. No limits, DNS/TLS policy, firewall rules, container restrictions or dependencies changed.

| Requested URL | Final report URL | KindPath API result | Rules with violations | Inconclusive rules | Blocked / failed requests |
| --- | --- | --- | ---: | ---: | --- |
| `https://google.com/` | `https://www.google.com/` | 200, report displayed | 5 | 2 | 6 / 6 |
| `https://github.com/` | Not established | 503, `SCAN_FAILED` | — | — | Not returned |
| `https://martinfowler.com/` | `https://martinfowler.com/` | 200, report displayed | 5 | 1 | 1 / 1 |
| `https://designgurus.io/` | Not established | 503, `SCAN_FAILED` | — | — | Not returned |
| `https://instagram.com/` | `https://www.instagram.com/` | 200, report displayed | 2 | 1 | 6 / 6 |

The status codes above are KindPath API responses, not evidence that the target websites returned those statuses. The generic failure response does not establish whether GitHub or Design Gurus failed because of timing, request limits, network conditions, site protections or another cause. No retry, policy relaxation or speculative production fix was made. Diagnosing those failures remains follow-up work; this result does not establish support for every public website.

The successful attempts exercised one continuous live URL-to-report flow through the default API and sandboxed Chromium interface. Original/final URL labels, public report mode, confirmed-rule and inconclusive-rule counts, and result focus matched the actual responses. Failed attempts displayed a clear error and no partial report. No demo report substituted for a scan. Capture stayed disabled and no snapshot was returned or preview iframe opened. The QA browser had no external network; only API requests for the five exact targets were relayed to the loopback backend. Third-party page execution remained inside the isolated scanner.

Scanner container, socket-volume and network absence was verified before handing each response to the UI. After all five attempts, the temporary API stopped, both source flags were confirmed false, and a fresh default API reported both capabilities false and rejected POST `/api/scan-public` with 503 / `PUBLIC_SCANNING_DISABLED`. Final daemon queries confirmed no owned fixture/public/QA containers, socket volumes or scanner networks.

These counts describe the anonymously served documents at that time, with the reported resource omissions. They are not accessibility scores, stable site expectations, authenticated-content checks or evidence of conformance. Missing resources may affect findings. No site-wide crawl, capture, report enhancements, account access or public deployment was added. Raw reports and the temporary verification harness remain outside the repository; no enabled configuration or sensitive artifacts are committed.
