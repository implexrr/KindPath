# Single-page redirect validation

Status: preparation only; no live attempts have been made for this branch. Public scanning and capture remain disabled.

## Bounded scope

Validate the existing website-entry -> default local API -> isolated Chromium/axe worker -> JSON report/download flow under the single-page redirect policy. This is an anonymous, report-only check, without crawling, sign-in, preview capture, deployment or a paid service. No new runtime feature or dependency is planned.

Exact live targets and the attempt count require separate confirmation before execution. The proposed batch is one attempt each for `https://example.com/`, `http://github.com/` and `https://martinfowler.com/`. An expected HTTPS upgrade is a test hypothesis, not a recorded observation. Approval of other historical batches does not authorize this batch.

## Checks and stop conditions

- Confirm the current image identities against fresh local assessment evidence and verify absence of owned scanner resources before activation. Preserve existing isolation, DNS pinning, firewall, TLS and execution budgets; do not suppress image findings or infer universal safety.
- Only after the exact batch is approved, temporarily enable scanning in the local working tree. Keep capture disabled and use the default application route/controller, not a dependency-injected live scanner. The interface browser stays network-disabled; only the isolated scanner contacts public websites.
- Make at most the approved number of attempts, sequentially. A failure consumes an attempt. Do not silently retry, follow links, or fetch a page separately to investigate.
- On success, validate public mode, normalized submitted URL, permitted final URL, scan identity, report fields and coverage. Check the interface displays the actual response and its JSON download preserves the report fields and limitations. A final URL alone does not prove every intermediate hop; the worker's controlled interception tests establish that separate boundary.
- On failure, record only validated stage/code metadata and the fixed user-facing explanation. Verify no partial, previous or demo report is displayed or offered for download. Do not guess the cause of a network/browser failure.
- Verify owned resource cleanup before accepting every outcome and before the next attempt. Stop on a cleanup/admission/isolation failure, unexpected API contract, mismatched report or observed policy violation. Do not relax safeguards or add attempts to obtain a success.
- Always settle active work and cleanup, stop the temporary API, restore the exact disabled policy source, and verify a fresh default API reports both capabilities false and rejects public scanning with `PUBLIC_SCANNING_DISABLED`. Verify resource absence separately; disabled flags alone do not establish cleanup.

## Evidence boundaries

Keep raw responses, harness code and screenshots outside the repository. Commit only sanitized target/outcome records, relevant counts, verified JSON/UI checks and limitations. Record the reviewed source and assessed images. These observations describe one anonymous page visit at that time, not site-wide accessibility, conformance, authenticated content or general live compatibility. No enabled policy is to be committed. Further live requests require separate approval.
