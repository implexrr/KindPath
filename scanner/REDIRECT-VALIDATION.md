# Single-page redirect validation

Status: three approved report-only attempts completed on November 9, 2026. All three returned reports, displayed in the interface, and matched their JSON download payloads. Scanning is restored to disabled; capture remained disabled throughout.

## Bounded scope

Validate the existing website-entry -> default local API -> isolated Chromium/axe worker -> JSON report/download flow under the single-page redirect policy. This is an anonymous, report-only check, without crawling, sign-in, preview capture, deployment or a paid service. No new runtime feature or dependency is planned.

Approved scope: one attempt each for `https://example.com/`, `http://github.com/` and `https://martinfowler.com/`. The protocol anticipated an HTTPS final URL for HTTP GitHub; the observed final URL is recorded below without inferring an upgrade mechanism. This approval covers only this batch; further live requests require separate approval.

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

## Observed results — November 9, 2026

Production source: `c74eb08`; validation documentation before execution: `b55581c`. Only the local scanning constant was temporarily enabled. No application/scanner logic, dependency, network/TLS policy, resource budget or container isolation changed. The rebuilt images matched the refreshed [local assessment](IMAGE-ASSESSMENT.md) before and after execution.

| Submitted URL | Final report URL | API status | Rules with violations | Inconclusive rules | Blocked / failed requests | Omitted elements |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `https://example.com/` | `https://example.com/` | 200 | 3 | 1 | 0 / 0 | 0 |
| `http://github.com/` | `https://github.com/` | 200 | 0 | 2 | 63 / 64 | 5 |
| `https://martinfowler.com/` | `https://martinfowler.com/` | 200 | 5 | 1 | 1 / 1 | 2 |

Exactly one attempt was made per submitted URL, sequentially. Every report used public mode, retained the submitted and permitted final URLs, and had a scan identity and valid timestamp. The interface displayed each actual response, matched the returned confirmed/inconclusive rule counts, and focused the result. The payload behind its JSON download link preserved URLs, timestamp, findings, scanner metadata, manual checks, coverage and server limitations. The live harness read that payload directly; it did not trigger a browser file-save event for these responses. As designed, the export excluded captured HTML and ephemeral scan identity. No preview snapshot or iframe was returned/displayed. No previous or demo report was substituted.

The HTTP GitHub input produced an HTTPS final report URL with unchanged hostname/path/query. The experiment did not record the redirect chain or determine whether this upgrade came from a server redirect or browser upgrade behavior. Do not infer that mechanism. These three live visits did not exercise a www change or a rejected redirect; those boundaries retain their separate controlled-test evidence.

Scanner container, socket-volume and network absence was confirmed before each response was handed to the interface and before the next attempt. After completion, the temporary API stopped, exact disabled policy bytes were restored, and a fresh default API reported both capabilities false and returned HTTP 503 / PUBLIC_SCANNING_DISABLED for public scanning. Final daemon checks confirmed no owned fixture/public/QA containers, socket volumes or scanner networks; all three assessed image identities remained unchanged.

## Interpretation and checks

These observations validate URL entry through the default isolated scanner to displayed/downloadable JSON for these three anonymous page responses. No production fix was needed. They do not establish general site compatibility, complete homepage rendering, authenticated-content accessibility, preview fidelity or conformance. No page identity beyond the requested/final URLs was independently established; a served consent/challenge page is possible and must not be ruled out by inference.

GitHub had substantial resource omissions and five omitted affected elements; Martin Fowler had resource omissions and two omitted elements. Blocked and failed counts may overlap. No omitted rules were reported. Missing resources and bounded results can change findings; GitHub's zero returned violation rules is not an accessibility pass.

Fresh preflight and post-restoration checks passed: 115 unit/API tests, TypeScript/Vite build, and post-restoration application/scanner dependency audits with zero known vulnerabilities. The existing 178-test controlled suite passed at production source c74eb08; it was not rerun for this documentation-only branch. Free local Grype reassessed the exact images before execution using the cached database: scanner/firewall had zero high/critical matches; QA retained the same seven recorded high matches. No findings were suppressed or accepted, and the advisory database was not refreshed.

Both public capabilities remain disabled. No further requests, deployment, push, purchase or ongoing activation is authorized by this record. Raw responses and harness artifacts remain outside the repository.
