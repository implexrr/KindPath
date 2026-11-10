# Local container image assessment

Reassessed November 10, 2026 after the bounded [component-text and body-appearance improvements](CONTENT-RETENTION.md), source `2a19c57`, including the reviewed paragraph-grouping correction. Dependencies and base digests are unchanged. The table binds these rebuilt images to local cached-database results; earlier live attempts used their then-assessed images, not these updated collectors. **Public capture and scanning remain disabled; this branch made no public-site requests.** Scanner and firewall images pass the raw high-severity threshold. QA retains the same seven high matches without suppression or risk acceptance. This is not approval for activation.

## Image roles and build inputs

- `kindpath-fixture-scanner:local` is the `worker` target: fixture scans/previews, the prepared submitted-page worker and its gateway use it. It starts from the existing pinned Ubuntu 24.04 base and copies Node, locked JavaScript packages, headless Chromium and FFmpeg from build stages. It does not inherit the multi-browser filesystem layers.
- `kindpath-browser-qa:local` is the `qa` target: Chromium/Firefox/WebKit UI verification and fixed synthetic TLS origins use it. It retains the existing targeted GStreamer repair. It is never a fallback for submitted-page workers.
- `kindpath-firewall:local` remains the minimal Node/nftables helper. It has no browser.

The existing Ubuntu base digest is `sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852`. The pinned Playwright 1.65.0 build/QA source digest is `sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`. Its Node and selected browser files are build inputs, not runtime parent layers. Cold builds can still download the full vendor image for these inputs and QA; this change reduces the shipped scanner filesystem, not necessarily build download traffic.

Playwright/playwright-core remain locked at 1.65.0. The runtime uses the locked CLI's Chromium-only system dependency installation, package-managed CA certificates and the pinned distribution's headless browser. No host browser, new npm dependency, compiler or global npm installation is introduced into the scanner. The seccomp profile, resource limits, users, capabilities, mount restrictions, firewall and cleanup guarantees are unchanged.

## Method and exact images

Free local Anchore Grype v0.121.2 inspected the squashed arm64 filesystems with `--scope squashed -o json --fail-on high`. Its official release archive was checksum-verified previously. All three scans used the same validated database, schema v6.1.10, built `2026-11-08T06:19:57Z`; archive SHA-256 `dcca24722e16c2bcf4a542a3f7fdd2147baf9215c17b973f5a7d4243fbddacea`. The same cached database was used for these local scans; an earlier update check that day reported no newer candidate. This reassessment did not perform a fresh database update check. Application update checks and automatic database updates were disabled during scanning. No inventories were sent to a cloud service, and no subscription, trial, Pro/ESM attachment or paid operation was used. Raw JSON evidence remains outside the repository.

| Local image | Arm64 configuration digest (Grype imageID) | OCI index/repository digest |
| --- | --- | --- |
| Chromium scanner runtime | `sha256:aa482e35ea218221970c7023e7aa9f611ddbbf9f4a7c2131ad329dcb31ee50d5` | `sha256:fec9010e5319990bfc032884a85725d9214271841bdcd14bcb4e07094a6004cc` |
| Browser QA | `sha256:37371fddfa42be0ac825439badf0fc103dbc1d05b629871320ee043f05a3ed3f` | `sha256:28004b81e845dc055f3ebaf0ee0a51fd323cccd7e0744aa04b97f12f58ca743e` |
| Firewall helper | `sha256:38024b7679a536a3d65e7044608021fa9a38a70e5a974d58b54c4250f1f3cf0f` | `sha256:54c6ef0657527c3b1820927ca9c24bfb4a24e7a12a728688afc63a1b6a962443` |

Docker's local store reports the OCI index digest as its image ID; Grype reports the selected platform's configuration digest separately. Repository digests bind these reports to the local tags. Rebuilt attestation metadata can change an index even when the helper's filesystem/configuration stays unchanged.

| Image | Critical | High | Medium | Low | Negligible | High threshold |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Chromium scanner runtime | 0 | 0 | 176 | 24 | 3 | Passed (exit 0) |
| Browser QA | 0 | 7 | 1448 | 67 | 13 | Failed (exit 2) |
| Firewall helper | 0 | 0 | 59 | 7 | 2 | Passed (exit 0) |

Counts are advisory/package matches, not unique CVEs or independently confirmed exploitable defects. The runtime's 203 remaining matches are marked not-fixed (192) or wont-fix (11) in this database; none is marked as having an available fix. Medium/low findings have not all been independently cleared. A missing database match is not proof of safety or a patched Chromium/browser/kernel/VM.

## Inventory and compatibility evidence

The image split's earlier inventory contained 202 installed packages versus QA's 511. At that point Docker reported 1,317,397,527 bytes for the runtime and 3,629,174,151 for QA: approximately 64% smaller. These are reported image sizes, not unique host disk usage or a promise that existing cached layers were deleted.

The image split's sandboxed inventory checks found only `chromium_headless_shell-1254` and `ffmpeg-1013` under the runtime's browser directory. Firefox, WebKit and the two GStreamer bad-package records are absent. CA certificates are installed; npm and GCC are absent. The actual headless executable hashes match between runtime and QA: `6ce3e550aca822c99c1509e4352523d27903edb466818db964ba8087ebe068b4`. Both use Node v26.13.0 and Playwright 1.65.0.

The existing runtime isolation verification now rejects accidental Firefox/WebKit or GStreamer bad-package inclusion. Three-engine UI verification explicitly selects QA while keeping its existing network-none/read-only/non-root/capability and iframe checks. Synthetic TLS origins also select QA; this keeps test services separate from the submitted-page runtime. No arbitrary browser/image selector or fallback is exposed through HTTP.

The earlier diagnostics review’s 149 controlled tests passed: 98 unit/API, 7 isolated scanner, 25 gateway unit, 15 internal-origin gateway/API, 3 kernel firewall and 1 integration suite covering Chromium 158.0.8127.18, Firefox 159.0 and WebKit 27.2. TypeScript/Vite and all three image targets built successfully; both npm audits returned zero known vulnerabilities. Earlier [report-only live validation](REAL-WEBSITE-VALIDATION.md) used the then-current builds for five approved attempts: three reports displayed and two scans failed with unresolved causes. Two subsequent pre-fix diagnostic retries recorded navigation-guard rejection during analysis. After the controlled History API fix, [six approved report-only retries](REPORT-VERIFICATION.md) using their then-assessed images returned reports, with significant resource omissions; these successes do not establish the causes of earlier failures. Capture stayed disabled; this does not establish general site compatibility. An earlier restricted-build example.com attempt is recorded in the [validation record](MVP-VALIDATION.md). During initial implementation, one WebKit interaction timed out during concurrent image analysis. All three engines passed the subsequent review with cross-host report/preview and invalid-URL regressions; image analysis ran separately. No remote CI was run for this unpushed branch.

The preceding assessed images were used for [twenty approved anonymous scan-and-capture attempts](WEBSITE-PREVIEW-VALIDATION.md): sixteen returned reports and snapshots and four failed. Boundary/control checks passed on the returned captures, but six had no rendered text; these are not sixteen useful-preview or fidelity passes. No image/dependency change, fresh image advisory scan, suppression or risk acceptance accompanied that earlier validation. Both public features were restored to false.

The earlier whitespace-only retention branch passed 161 controlled tests: 108 unit/API, 7 scanner, 25 gateway unit, 17 gateway integration, 3 firewall and 1 three-engine UI suite, plus the TypeScript/Vite build and both npm audits. All three images built successfully. Free local Grype reassessed these exact rebuilt images with the same cached database; the severity counts in this assessment are unchanged. No public site was visited, and the controlled whitespace fix does not establish improvement on the earlier live targets.

## Open QA findings and activation decision

The former combined image's seven high matches are confined to QA after the split; no advisory suppression was added. Five concern Firefox. CVE-2007-4013, CVE-2014-6492 and CVE-2009-4102 appear to be broad-CPE matches for legacy Citrix, Oracle Java and Sage-extension products. The earlier bounded image inspection and fresh test profiles support those mismatch classifications. CVE-2007-2176 and CVE-2009-1597 retain unresolved historical applicability. They have not been declared fixed.

[Mozilla's Firefox 159.0.1 advisory](https://www.mozilla.org/en-US/security/advisories/mfsa2026-123/) also requires QA follow-up: the bundled engine reports 159.0, CVE-2026-120572 is absent from the current Grype result, and its vendor-backport/applicability status remains unverified. The detailed Mozilla bug is access-restricted. Firefox and WebKit must remain limited to controlled tests; they are not used to visit submitted pages.

The remaining two high package records concern CVE-2025-3887. QA retains the reviewed GStreamer source backport and its parser tests, bounds regression, symbol comparison, provenance and installed-library checksum `4852034e86f6c92af2ec63acb67caa4438e7ad287932aeecd718309018596727`. The package version remains unchanged, so version-based scanners still match it. The lean scanner does not include these packages or this custom backport.

The runtime now passes this image threshold; that does not automatically enable the application or accept QA risks. Both public constants remain false. The expanded path was reviewed before the five explicitly approved report-only attempts, and both gates were disabled afterward. Additional live requests, capture or ongoing activation require separate approval; the [snapshot validation plan](MVP-VALIDATION.md) records the earlier restricted-build attempt. Do not bypass default gates through a test dependency injection or enable unsupported browsers to obtain a live result.

Historically, the Playwright 1.64.1 combined worker had 28 critical/144 high matches; the 1.65.0 combined image had 0 critical/7 high using this same database. The current role-specific table supersedes those combined-worker counts. Historical Docker Scout totals use different matching/feed data and are not directly comparable.


The redirect-policy review at `c74eb08` passed 178 controlled tests. The subsequent three approved report-only visits used their then-assessed images recorded with the November 9 validation, before this collector extension; they are not live evidence for the current component/body changes.

The current content-quality branch passed 184 controlled tests: 119 unit/API, 7 scanner, 25 gateway unit, 29 gateway integration, 3 firewall and 1 three-engine UI suite. TypeScript/Vite, all three image builds and both dependency audits passed. The two new capture cases failed before and passed after the change; implementation-stage controlled captures were rendered and visually inspected in a network-disabled opaque iframe; the review additionally verified preserved paragraph grouping in the actual parsed DOM. Same-visit identity, inert navigation, hidden/form-value/unsupported-content exclusions and unchanged truncation limits remain covered. No live site was retried.

Free local Grype reassessed these exact images with the same cached database and left severity counts unchanged. The advisory database was not refreshed; no inventory was sent to an external service. These are image-assessment and controlled-compatibility observations, not universal security or fidelity clearance. Both public capabilities remain disabled.

The review added the existing bounded availability probe before the atomic firewall fixture installs its rules, preserving the original denied-destination and fingerprint assertions. Fresh affected checks passed without changing production policy or deadlines. The image reassessment after the paragraph fix used the same cached database and retained the same advisory counts; no live website was requested.
