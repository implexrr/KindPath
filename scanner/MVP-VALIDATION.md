# Single-page MVP validation

**Status: one approved local scan completed; public scanning and capture are disabled again.** The completion record below separates the live API result from subsequent offline UI verification. The recorded live request used the earlier hostname-restricted build; the newly prepared multi-host path has controlled validation only. This document does not authorize another live request. The current [image assessment](IMAGE-ASSESSMENT.md) separates the Chromium runtime from QA findings; a passing runtime image threshold does not authorize activation.

The acceptance goal is KindPath's existing flow: submit one page, receive actionable automated findings, and compare a matching inert snapshot with adjustable vision effects. No accounts, database, crawl, new domains, extra condition models or deployment are part of this validation.

## Evidence and remaining limits

| Area | Verified evidence | Still unverified |
| --- | --- | --- |
| URL to findings | Controlled controller/HTTP/axe integration plus one default-API example.com scan using public DNS, normal TLS validation and the actual response | Other public pages and repeatability |
| Same-visit preview | Live response identity and cleanup checked; captured text displayed in offline UI verification | Pixel-perfect fidelity and unsupported resources |
| User flow | Three-engine controlled scenarios and offline UI verification of the actual live response | One uninterrupted live UI session completing every observation |
| Preview boundary | Opaque iframe origin, empty sandbox, guarded document, inert links/forms and omitted scripts/resources | No universal browser/VM escape guarantee follows from these checks |

The live scan succeeded, but the initial UI harness stopped on an outdated page-content assumption. The saved response was then verified offline, without another public request. This is not an uninterrupted live end-to-end pass. Demo findings must never be accepted as evidence about the submitted URL.

## Approval gate

Before requesting activation, review the current image concerns and the exact enabled path. Unresolved applicability must be reported rather than silently suppressed or accepted. If an upstream repair or architectural change is required, stop and propose that bounded change separately.

Any future activation request must explicitly identify all of the following:

- Local checkout and local API only, with no publishing, pushing, deployment or purchase.
- Proposed changes to `server/scanner/publicPolicy.ts`: both `PUBLIC_SCANNING_ENABLED` and `PUBLIC_CAPTURE_ENABLED` would change from false to true. **Neither enabled value is retained or committed by this branch.**
- Current prepared eligibility covers public HTTP/HTTPS hostnames on standard ports, including separately approved redirect and resource hosts within the per-scan limits. The original smoke below used the older example.com-only policy. A future activation review must assess the expanded destination path; one example.com input does not restrict the page's redirects or subresources to that hostname. No certificate, private-address or sandbox bypass is permitted.
- The operator's smoke input is exactly `https://example.com/`, for one scan attempt. No real-site scan, retry or cancellation experiment is authorized by this document. Public DNS and page connections are part of that later requested action.
- After every outcome, including failure, cancellation or an early stop, complete the cleanup and disabled-state restoration below before ending the session. Continued activation requires a separate explicit approval.

There is no environment toggle, HTTP override or alternative live-test runner. Do not call the prepared dependency-injected controller against a real site while the default capabilities are disabled. The URL eligibility policy and implementation approval do not replace activation approval.

## Proposed smoke after explicit approval

1. Confirm the approved source revision, matching assessed scanner/QA/firewall images and their intended roles, and absence of leftover owned scanner containers, socket volumes and networks. Leave unrelated resources alone. Start the existing local development app; verify its capabilities agree with the reviewed temporary policy change.
2. Enter the exact approved URL and use **Scan website** once. Do not use **Try an example** or **Scan built-in page** as substitutes. Record whether it succeeds or fails within the existing limits; do not bypass certificate failures, blocked DNS or resource policies.
3. On success, verify `mode: public`, the normalized requested URL and allowed final URL, actionable findings or an honest empty state, manual-review guidance and stated resource omissions. No exact violation count is prescribed for a public page, and no automated result establishes conformance.
4. Open **Visual preview**. Confirm the two panels use the same scan-bound website snapshot, not the separate garden illustration. Inspect source labels, recognizable static text and supported layout. Treat the result as a structural approximation, not a pixel-perfect copy; do not make a second public visit or open the source on the host browser for comparison. Images, scripts, embedded ads, frames, custom fonts, form values and unsupported structure/styles remain omitted. Static ad text is only expected if present; example.com need not contain an advertisement.
5. Use the existing vision controls and pause/reset. Hover supported links without navigating; absence of a source hover rule is not a failure. Clicking a captured link or disabled control must not navigate, submit, open a popup or fetch a resource. Keep the controls outside the altered panel and verify keyboard focus.
6. Download JSON and inspect print layout. Both retain the full report and request/final URL labels while excluding captured HTML and ephemeral scan identity. Keep any local evidence free of credentials and personal content; do not upload artifacts.
7. Confirm resource absence after completion. Successful worker output becomes a report only after cleanup is verified. If the operation fails or is cancelled, accept no partial report; cleanup must still be verified. The existing controlled suites cover deliberate cancellation/retry and stale-response scenarios, so this one-attempt smoke does not require extra live requests.
8. **Always restore the disabled state, on success, failure, cancellation or an early stop.** Stop issuing live requests, cancel any active request, and let its bounded cleanup finish before editing the policy or restarting the watched API. Restore both public constants to false without discarding unrelated edits, then restart the local API and reload the UI. Confirm capabilities report both false and POST /api/scan-public returns 503/PUBLIC_SCANNING_DISABLED before DNS/Docker. If cleanup could not be verified, retain that failure and the existing orphan/admission block; disabled flags do not prove resource absence. Do not start more work or delete unknown resources. Record the result and limitations, then stop.

Stop issuing live requests on a policy/isolation/cleanup failure, identity mismatch or unexpected destination; the mandatory cleanup and disabled-state restoration still apply. Do not expand hosts, disable TLS validation, expose host files, increase privileges or delete unknown resources to make the smoke pass. Additional live attempts require another explicit approval.

## Completion record

Record the source revision, image identity, approval scope, requested/final URL, outcome, report/preview identity match, relevant omissions, keyboard/navigation/export observations, cleanup result and restored disabled state. Label public DNS/TLS/live-page behavior as untested until it is actually exercised. Record partial results honestly; an interrupted UI observation is not evidence that the entire live UI flow passed. Further live attempts require explicit approval.


## Local validation result — November 9, 2026

- Reviewed source: `6f738c0`, with only the two public policy constants temporarily enabled in the local working tree. The current scanner, QA and firewall image digests matched [the recorded assessment](IMAGE-ASSESSMENT.md). No allowlist, DNS, TLS, firewall, sandbox or cleanup restriction was changed.
- Approval covered exactly one local scan of `https://example.com/`, with capture, followed by restoration. The sandboxed QA Chromium UI relayed its API requests to the loopback default API; it had no external network. The isolated scanner alone contacted the public page. No dependency-injected live controller or host browser was used.
- The single request returned HTTP 200, `mode: public`, and requested/final URL `https://example.com/`. It produced three findings (`landmark-one-main`, `page-has-heading-one`, `region`), one incomplete automated rule requiring manual review (`bypass`), a separate three-item manual checklist, ten passed checks and no reported blocked or failed requests. Findings are observations of that response, not stable expectations for this website or a conformance verdict.
- The report and snapshot matched by scan ID, requested URL and final URL. Scanner containers, socket volumes and networks were confirmed absent before the response was handed back to the UI. Capture reported three omitted subtrees, zero omitted text characters and zero omitted style declarations; unsupported resources remain subject to the stated snapshot limitations.
- The original UI verification stopped because its temporary harness expected an “Example Domain” heading. The actual response contained multilingual documentation text and no heading. This was a harness assumption, not a product defect; no application changes were needed.
- Without another public request, the saved actual response passed offline Chromium UI checks: report labels and focus, matching text in both snapshots, empty iframe sandbox, opaque parent boundary, no executable/navigation resources, inert link hover/click with no navigation or popup, colour/intensity/pause/reset controls, keyboard operation, JSON export and print/PDF generation. The JSON check matched findings and requested/final URL labels and excluded snapshot HTML and ephemeral scan identity. The print check confirmed a visible print view without iframes and a generated PDF; it did not establish visual print fidelity or PDF accessibility. This verifies the actual response in the UI, while the uninterrupted live UI session remains unproven.
- Both constants were restored to false, the temporary API stopped, and a fresh default API reported both capabilities false and rejected POST `/api/scan-public` with HTTP 503 / `PUBLIC_SCANNING_DISABLED`. No enabled state is committed. Further live attempts require separate approval. No push, deployment, purchase, advisory suppression or general activation occurred.
- Final local checks passed: 122 controlled tests (80 unit/API, 7 scanner, 22 gateway unit, 10 gateway integration, 2 firewall and 1 three-browser suite), TypeScript/Vite production build, and both npm audits with zero known vulnerabilities. Offline snapshot rendering was visually inspected. Final daemon queries confirmed no owned fixture/public/QA containers, socket volumes or scanner networks. The assessed image digests were unchanged; no remote CI was run.
