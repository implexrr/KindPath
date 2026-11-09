# Scan failure diagnostics

Public scanning and capture remain disabled. Failure responses can now include a small optional `diagnostic` object alongside the existing error and code. The normal interface keeps its existing error message; no diagnostic dashboard or external logging service is added.

```json
{"code":"SCAN_FAILED","diagnostic":{"stage":"page-loading","code":"HTTP_STATUS","httpStatus":404}}
```

Stages identify DNS, network setup, worker setup/execution, page loading, accessibility analysis, capture, result validation or cleanup. Codes come from an explicit allowlist. `FAILED` means no more specific allowed classification is established; it must not be interpreted as a root-cause diagnosis. HTTP status is an integer from 100 through 599, accepted only for a page-loading `HTTP_STATUS` diagnostic. A fallback `worker-execution / FAILED` identifies an unclassified runner failure; it does not prove that a browser reached page loading.

The worker emits one bounded structured marker on stderr. The controller accepts exactly one valid marker, reconstructs only known fields, and otherwise falls back to a known stage/code. Raw error messages, stack traces, page content, headers, URLs, credentials, paths and arbitrary codes are not included in diagnostics. The HTTP layer validates the object again. No raw diagnostic log is persisted by the app. Worker-reported metadata is not an authorization decision or proof of resource absence.

Cleanup remains authoritative: unconfirmed owned-resource cleanup overrides results and worker diagnostics with `SCANNER_CLEANUP_FAILED` and `cleanup / UNCONFIRMED`. The default disabled route still rejects requests before DNS or Docker. No limit, certificate, private-address, sandbox or network-isolation rule was relaxed.

## Approved diagnostic retries — November 9, 2026

Exactly one anonymous retry per URL ran through the default local API and network-disabled KindPath Chromium interface, with capture false. Runtime source for these retries was `0d26364`, before the navigation fix below. Scanning was temporarily enabled only for the two attempts and was restored to false afterward.

| URL | KindPath API result | Recorded diagnostic | Report |
| --- | --- | --- | --- |
| `https://github.com/` | 503 / `SCAN_FAILED` | `accessibility-analysis / PAGE_CHANGED_DURING_SCAN` | None |
| `https://designgurus.io/` | 503 / `SCAN_FAILED` | `accessibility-analysis / PAGE_CHANGED_DURING_SCAN` | None |

Both retries reached accessibility analysis, where the main-page stability guard rejected the operation. The diagnostics do not establish what triggered the navigation event or establish the causes of the older five-site validation's failures. No raw page or navigation-event details were retained from the two retries to make that attribution. Both errors appeared correctly in the interface without a partial report; cleanup was verified before each response was accepted. No additional live attempts ran.

## Verified controlled fix

A synthetic page repeating its current URL through `history.replaceState` reproduced a false rejection: the old guard returned `PAGE_CHANGED_DURING_SCAN` although that update did not replace the document. After the fix, that controlled case produces a report. Main-document requests, URL changes and document-identity changes still invalidate a scan; a real same-URL reload still fails, as do the existing changed-URL tests. The same document checks apply around optional capture.

This is a verified compatibility fix, not proof that either live site used that History API operation. The two sites have not been retried after the fix; post-fix live compatibility remains unverified. Further live attempts require approval. The current [image assessment](IMAGE-ASSESSMENT.md) describes the final post-fix builds, not the earlier retry images.

## Checks and limits

Controlled checks cover redaction, malformed/inherited/extra values, cancellation versus timeout, propagation across cleanup/API mapping, cleanup-failure precedence, a real synthetic HTTP 404, same-document history and real reload rejection. Raw reports, temporary activation/harness code and private paths remain outside committed files. No dependencies, paid features, service, storage system, crawl, ongoing activation or publication were added.

Final local checks passed: 148 controlled tests (97 unit/API, 7 scanner, 25 gateway unit, 15 gateway integration, 3 firewall and 1 three-engine UI suite), TypeScript/Vite build, all three image builds and both npm audits. Final image scans used the existing cached database; scanner/firewall had zero critical/high matches, while QA retained its documented seven high matches. One controlled 404 case initially failed at network setup rather than reaching the page; its isolated check and complete gateway rerun passed, without a cause being assigned or limits changed.
