# Single-page MVP validation

**Status: preparation only; public scanning and capture are disabled.** This plan neither enables execution nor authorizes a live request. The current [image assessment](IMAGE-ASSESSMENT.md) records unresolved concerns; the activation decision remains no-go in this branch.

The acceptance goal is KindPath's existing flow: submit one page, receive actionable automated findings, and compare a matching inert snapshot with adjustable vision effects. No accounts, database, crawl, new domains, extra condition models or deployment are part of this validation.

## Evidence available without public activation

| Area | Controlled evidence | Still unverified |
| --- | --- | --- |
| URL to findings | Real controller/HTTP/axe integration with injected DNS and internal origins; redirects, article/table/CSS, forms and missing pages | Real public DNS, a valid public TLS connection and an actual public-page response |
| Same-visit preview | Backend binds validated capture to the report's request, final URL and scan ID, after verified resource cleanup | Fidelity and limitations on the approved live page |
| User flow | Three-engine UI scenarios cover findings, exports, vision controls, cancellation/retry, stale responses and matching identity | One continuous live URL-to-report-to-preview session |
| Preview boundary | Opaque iframe origin, empty sandbox, guarded document, inert links/forms and omitted scripts/resources | No universal browser/VM escape guarantee follows from these checks |

The HTTP/controller and UI suites exercise separate boundaries; their passing results are not a completed live end-to-end smoke. Demo findings must never be accepted as evidence about the submitted URL.

## Approval gate

Before requesting activation, review the current image concerns and the exact enabled path. Unresolved applicability must be reported rather than silently suppressed or accepted. If an upstream repair or architectural change is required, stop and propose that bounded change separately.

A later activation request must explicitly identify all of the following:

- Local checkout and local API only, with no publishing, pushing, deployment or purchase.
- Proposed changes to `server/scanner/publicPolicy.ts`: both `PUBLIC_SCANNING_ENABLED` and `PUBLIC_CAPTURE_ENABLED` would change from false to true. **Neither change is applied by this branch.**
- Existing eligibility remains the exact hostname example.com over HTTP/HTTPS on standard ports. That policy permits same-host paths and redirects; it is not an exact-path network firewall. No allowlist, resource-host, certificate, DNS or sandbox relaxation is proposed.
- The operator's smoke input is exactly `https://example.com/`, for one scan attempt. No real-site scan, retry or cancellation experiment is authorized by this document. Public DNS and page connections are part of that later requested action.
- After every outcome, including failure, cancellation or an early stop, complete the cleanup and disabled-state restoration below before ending the session. Continued activation requires a separate explicit approval.

There is no environment toggle, HTTP override or alternative live-test runner. Do not call the prepared dependency-injected controller against a real site while the default capabilities are disabled. The candidate allowlist and implementation approval do not replace activation approval.

## Proposed smoke after explicit approval

1. Confirm the approved source revision, matching assessed local images, and absence of leftover owned scanner containers, socket volumes and networks. Leave unrelated resources alone. Start the existing local development app; verify its capabilities agree with the reviewed temporary policy change.
2. Enter the exact approved URL and use **Scan allowlisted website** once. Do not use **Try an example** or **Scan built-in page** as substitutes. Record whether it succeeds or fails within the existing limits; do not bypass certificate failures, blocked DNS or resource policies.
3. On success, verify `mode: public`, the normalized requested URL and allowed final URL, actionable findings or an honest empty state, manual-review guidance and stated resource omissions. No exact violation count is prescribed for a public page, and no automated result establishes conformance.
4. Open **Visual preview**. Confirm the two panels use the same scan-bound website snapshot, not the separate garden illustration. Inspect source labels, recognizable static text and supported layout. Treat the result as a structural approximation, not a pixel-perfect copy; do not make a second public visit or open the source on the host browser for comparison. Images, scripts, embedded ads, frames, custom fonts, form values and unsupported structure/styles remain omitted. Static ad text is only expected if present; example.com need not contain an advertisement.
5. Use the existing vision controls and pause/reset. Hover supported links without navigating; absence of a source hover rule is not a failure. Clicking a captured link or disabled control must not navigate, submit, open a popup or fetch a resource. Keep the controls outside the altered panel and verify keyboard focus.
6. Download JSON and inspect print layout. Both retain the full report and request/final URL labels while excluding captured HTML and ephemeral scan identity. Keep any local evidence free of credentials and personal content; do not upload artifacts.
7. Confirm resource absence after completion. Successful worker output becomes a report only after cleanup is verified. If the operation fails or is cancelled, accept no partial report; cleanup must still be verified. The existing controlled suites cover deliberate cancellation/retry and stale-response scenarios, so this one-attempt smoke does not require extra live requests.
8. **Always restore the disabled state, on success, failure, cancellation or an early stop.** Stop issuing live requests, cancel any active request, and let its bounded cleanup finish before editing the policy or restarting the watched API. Restore both public constants to false without discarding unrelated edits, then restart the local API and reload the UI. Confirm capabilities report both false and POST /api/scan-public returns 503/PUBLIC_SCANNING_DISABLED before DNS/Docker. If cleanup could not be verified, retain that failure and the existing orphan/admission block; disabled flags do not prove resource absence. Do not start more work or delete unknown resources. Record the result and limitations, then stop.

Stop issuing live requests on a policy/isolation/cleanup failure, identity mismatch or unexpected destination; the mandatory cleanup and disabled-state restoration still apply. Do not expand hosts, disable TLS validation, expose host files, increase privileges or delete unknown resources to make the smoke pass. Additional live attempts require another explicit approval.

## Completion record

Record the source revision, image identity, approval scope, requested/final URL, outcome, report/preview identity match, relevant omissions, keyboard/navigation/export observations, cleanup result and restored disabled state. Label public DNS/TLS/live-page behavior as untested until it is actually exercised. This preparation branch is complete when the review/checklist and controlled checks are recorded; live MVP validation remains pending activation approval.
