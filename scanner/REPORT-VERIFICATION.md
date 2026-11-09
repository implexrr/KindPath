# Real website report verification

## Approved scope

Run three anonymous report-only attempts each for `https://github.com/` and `https://designgurus.io/` through the existing local KindPath interface and default isolated scanner. Alternate the targets, without concurrent scans. Keep capture disabled, temporarily enable scanning only for this bounded batch, and restore it afterward. No crawling, login, paid service or deployment is included.

Before activation, verify assessed image identities and absence of owned scanner resources. For each successful response, verify the requested/final URL labels, public report mode, confirmed and inconclusive rule counts, manual-review guidance, report identity and JSON export against that response. For a scan failure, retain only validated stage/code metadata in the public evidence and confirm a clear interface error without a partial or previous report. Confirm scanner resource cleanup before accepting any outcome or starting the next attempt.

Stop on an unexpected API response, report mismatch, policy/isolation violation or unconfirmed cleanup. Do not relax safeguards, raise limits or silently make extra requests to obtain a result. A failure counts as an attempt. After completion or early stop, stop the temporary API after active work settles, restore scanning to false, verify capture remained false, and check a fresh default API rejects public scanning. Keep raw responses and temporary harness artifacts outside the repository.

## Interpretation

The earlier [diagnostic retries](SCAN-FAILURE-DIAGNOSTICS.md) used a pre-fix navigation guard. This batch checks the current implementation; it cannot establish the exact causes of historical failures. Successful reports describe only the anonymously served page at that time, with reported resource omissions. They do not establish site-wide coverage, authenticated-content accessibility, stable findings or conformance.

Status: planned; no attempts for this batch have run yet.
