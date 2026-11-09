# Real website preview validation

## Approved scope

One anonymous scan-and-capture attempt per HTTPS homepage below, through the default local API and existing KindPath interface. The selected sample draws from [Similarweb’s August 2026 popular-site listing](https://www.similarweb.com/blog/research/market-research/most-visited-websites/); it is not a claim to be the ranked top twenty. No sign-in, paid service, crawl, automatic retry or deployment is included. Page redirects and resources remain subject to the current public-target, DNS, TLS, firewall and resource policies.

- `https://google.com/`
- `https://youtube.com/`
- `https://facebook.com/`
- `https://instagram.com/`
- `https://x.com/`
- `https://reddit.com/`
- `https://bing.com/`
- `https://tiktok.com/`
- `https://wikipedia.org/`
- `https://amazon.com/`
- `https://yahoo.com/`
- `https://linkedin.com/`
- `https://netflix.com/`
- `https://pinterest.com/`
- `https://microsoft.com/`
- `https://duckduckgo.com/`
- `https://github.com/`
- `https://apple.com/`
- `https://spotify.com/`
- `https://bbc.com/`

Temporarily enable both public features only for this bounded local batch; restore both to false on completion or early stop. Verify matching assessed image identities and absence of owned resources before activation. Run serially, verifying scanner cleanup before accepting each outcome and starting the next attempt. Stop on unconfirmed cleanup, isolation/policy violation, identity mismatch or unexpected API failure. Do not weaken limits to obtain a result.

## Acceptance and limitations

On success, verify public report mode, request/final URL labels and report/snapshot identity. Compare both preview panels against the returned sanitized snapshot, without assuming the live page contains particular wording. Check empty iframe sandbox, opaque origin, guarded inert content, absence of navigation/resource attributes and executable elements, disabled controls, link hover/click without navigation, and modified-panel-only vision effects with keyboard pause/reset. Check report export and print exclude preview HTML and ephemeral scan identity. Record resource and capture omissions.

A failed scan ends that URL’s attempt with no partial report. A successful API response is separate from a completed UI verification. Raw responses, screenshots and temporary harness code remain outside the repository. Existing controlled tests cover security and cases absent from individual live captures.

Previews are bounded structural approximations. Images, scripts, frames, embedded advertisements, custom fonts, form values and unsupported styles/structure are omitted. A login, consent or challenge page does not assess the authenticated service. Single-page findings and a recognizable preview do not establish full fidelity, site-wide coverage or accessibility conformance. No universal isolation guarantee follows from these checks.

Status: twenty approved attempts completed on November 9, 2026. Sixteen returned reports and snapshots; four failed. Six returned snapshots had no rendered text. Both public features are disabled again.

## Observed outcomes

Runtime source: `4f1f121` (production code unchanged from `498283d`), with only the two public constants temporarily enabled in the local working tree. The scanner, QA and firewall tags matched the existing [image assessment](IMAGE-ASSESSMENT.md) before and after the batch. No dependency, image, capture budget, DNS/TLS rule, firewall, sandbox or other limit changed.

The table records KindPath API statuses, returned rule counts, and trimmed `innerText` length across the scrollable original snapshot document. A positive text count is not a fidelity or usability verdict and does not imply that text appears in the initial preview viewport. Final hosts alone are recorded to avoid publishing response query identifiers or path details.

| Requested host | API | Final host | Violations / inconclusive rules | Snapshot text characters | Blocked / failed requests |
| --- | ---: | --- | --- | ---: | --- |
| google.com | 200 | www.google.com | 5 / 2 | 116 | 6 / 6 |
| youtube.com | 200 | www.youtube.com | 0 / 1 | 0 | 80 / 81 |
| facebook.com | 200 | www.facebook.com | 1 / 0 | 0 | 3 / 3 |
| instagram.com | 200 | www.instagram.com | 2 / 1 | 0 | 6 / 6 |
| x.com | 503 | Not established | — | — | — |
| reddit.com | 503 | Not established | — | — | — |
| bing.com | 200 | www.bing.com | 1 / 0 | 28 | 49 / 49 |
| tiktok.com | 503 | Not established | — | — | — |
| wikipedia.org | 200 | www.wikipedia.org | 1 / 1 | 1175 | 0 / 0 |
| amazon.com | 200 | www.amazon.com | 3 / 0 | 0 | 2 / 2 |
| yahoo.com | 503 | Not established | — | — | — |
| linkedin.com | 200 | www.linkedin.com | 2 / 2 | 553 | 484 / 482 |
| netflix.com | 200 | www.netflix.com | 4 / 2 | 210 | 18 / 38 |
| pinterest.com | 200 | www.pinterest.com | 3 / 1 | 489 | 10 / 11 |
| microsoft.com | 200 | www.microsoft.com | 1 / 0 | 0 | 41 / 41 |
| duckduckgo.com | 200 | duckduckgo.com | 6 / 2 | 993 | 7 / 7 |
| github.com | 200 | github.com | 0 / 2 | 15 | 57 / 58 |
| apple.com | 200 | www.apple.com | 5 / 5 | 347 | 0 / 1 |
| spotify.com | 200 | open.spotify.com | 3 / 0 | 0 | 1 / 1 |
| bbc.com | 200 | www.bbc.com | 3 / 1 | 1182 | 88 / 99 |

Blocked and failed request counts may overlap. Counts above describe rules, not affected elements or conformance. Returned result limits also omitted affected elements on LinkedIn (38), Netflix (18), Pinterest (3), GitHub (4), Apple (10) and BBC (44); no rule omissions were reported in this batch.

### Observed failures

| Requested host | Diagnostic | What is established |
| --- | --- | --- |
| x.com | `page-loading / HTTP_STATUS / 403` | The main-page response was rejected with HTTP 403; this is distinct from KindPath’s HTTP 503. |
| reddit.com | `page-loading / PAGE_CHANGED_DURING_SCAN` | The page-stability guard rejected loading; the triggering page operation was not retained. |
| tiktok.com | `accessibility-analysis / PAGE_CHANGED_DURING_SCAN` | The page-stability guard rejected analysis; the triggering page operation was not retained. |
| yahoo.com | `page-loading / PAGE_CHANGED_DURING_SCAN` | The page-stability guard rejected loading; the triggering page operation was not retained. |

All four displayed a clear error with no partial report or snapshot. These diagnostics identify an observed rejection, not the underlying reason for a site’s behavior. No retry or speculative fix followed.

## What passed and what did not

All sixteen successful responses matched public mode, normalized request URL, final URL and report/snapshot scan identity. Both frames received exactly the same returned sanitized HTML, behind the outer document guard. The live KindPath interface ran in network-disabled QA Chromium; only the exact approved local API requests were relayed. Submitted pages executed in the isolated scanner. No external request from the QA interface was observed. Scanner containers, socket volumes and networks were confirmed absent before accepting each response or starting the next scan.

For all sixteen returned captures, checks verified empty iframe sandbox, no-referrer policy, blocked access from the iframe to the parent document, guarded content, absence of executable/navigation/resource-bearing elements and attributes, and disabled remaining input/button controls. Nine captures offered a visible link for hover and a dispatched click; none navigated or opened another page. No color change was measured by those hover checks; this does not prove the absence of other hover effects or validate live-site hover fidelity. Controlled fixtures separately exercise retained hover styles and form behavior.

Each returned capture passed modified-panel-only effect styling, keyboard blur adjustment, pause and reset checks. JSON matched the report’s request/final identity, timestamp, findings, scanner metadata, manual checks and coverage, retaining the existing limitations and excluding HTML, snapshot and ephemeral scan identity. The print view displayed matching coverage feedback without an iframe, and Chromium generated a PDF. This is not visual print-quality or PDF-accessibility verification. Export and control checks made no additional scan request.

Six snapshots—YouTube, Facebook, Instagram, Amazon, Microsoft and Spotify—had zero rendered text. These are not useful full-page preview successes merely because the API and isolation checks passed. Ten contained some rendered text, including very sparse Bing (28 characters) and GitHub (15 characters) captures. Text may lie outside the initial iframe viewport. Visual samples from Google, YouTube, Facebook, Wikipedia, GitHub and Apple confirmed substantial omissions or sparse/blank initial panels; they do not establish source-page fidelity.

Every capture reported omitted subtrees, ranging from 2 to 121, and style omissions ranged from 0 to 5,936 declarations. No text-budget truncation was reported. A zero omitted-text count does not mean all source text survived: dropping an entire subtree does not count its unvisited text as character-budget truncation. The retained snapshot and counters do not establish the exact per-site cause of an empty or sparse capture. No original-page DOM was retained, and no second public visit was made to determine the cause.

This validates a continuous live report-to-snapshot UI path and its boundaries on the observed responses. It does not validate broadly useful visual fidelity across popular sites. Capture quality and clear feedback for empty/sparse snapshots remain follow-up work; these results do not justify increasing privileges, removing guards or enabling public features. Raw HTML, screenshots, generated query identifiers and temporary harness code remain outside the repository.

## Final checks and restoration

All 105 unit/API tests and the TypeScript/Vite production build passed before and after the live batch. The complete controlled Chromium/Firefox/WebKit suite passed before activation, including the existing iframe, inert-navigation, stale-response and report/export checks. An offline rehearsal using an older saved capture verified the batch harness without a new public request. Both fresh npm audits returned zero known vulnerabilities.

After the twentieth attempt, active work and cleanup settled, the temporary API stopped, and both source constants were restored to false. A fresh default API reported both public capabilities false and rejected public scanning with HTTP 503 / `PUBLIC_SCANNING_DISABLED`. Final daemon queries confirmed no owned fixture/public/QA containers, socket volumes or scanner networks and unchanged assessed image identities. No new container-image build or image vulnerability scan was run on this documentation-only branch because the assessed image inputs were unchanged; existing advisory findings remain recorded and unaccepted.

All twenty approved attempts were consumed. Additional live requests require approval. No runtime change, dependency, service, continued activation, push, merge, deployment or purchase was added.
