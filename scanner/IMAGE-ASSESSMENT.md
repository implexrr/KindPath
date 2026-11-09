# Local container image assessment

Assessed November 9, 2026 after updating Playwright 1.64.1 → 1.65.0 and its matching image. **Public capture and scanning remain disabled. The worker still fails the raw high-severity threshold; this is not approval for activation.**

## Method and exact images

The free, local [Anchore Grype](https://github.com/anchore/grype) v0.121.2 scanner inspected the squashed filesystems of both arm64 images. Its official release archive was previously checksum-verified. Both assessments use the same validated database, schema `v6.1.10`, built `2026-11-08T06:19:57Z`; archive SHA-256 `dcca24722e16c2bcf4a542a3f7fdd2147baf9215c17b973f5a7d4243fbddacea`. No image/package inventories were sent to a cloud scanning service. No subscription, trial or paid operation was used.

The official [Playwright 1.65.0 release](https://github.com/microsoft/playwright/releases/tag/v1.65.0) image is pinned to the registry-verified index digest `sha256:6e3fb709361521eb27161606e6da6d2674e5e89fa16516cb37d6fdd91372273d`. Only Playwright/playwright-core versions changed in the worker lockfile; no packages were added. The upstream seccomp profile is unchanged between these releases; the existing local chroot allowance is retained without adding privileges.

| Local image | Arm64 configuration digest (Grype imageID) | OCI index/repository digest |
| --- | --- | --- |
| Worker | `sha256:cb6d69005ef6e4607dddbc8375f6f1e6862825fd7e10a2b614699996448de74f` | `sha256:fe1f8a2a4985f35836184af8b4915f8ab900a30fe5a0ace10148ef046f536702` |
| Firewall helper | `sha256:ed7936dcb3be22ca4f6e77959fefee4003ee43c59f7ab1771229650a20f9b1e8` | `sha256:1ccf1b8782e811fd28e4292b30d0c9335d75d79e0bfa65f10356fab66c41a603` |

Docker's local image store reports the OCI index digest as its image ID. Grype reports the selected platform's configuration digest separately; compare repository digests to bind a report to these local tags. The helper's filesystem/configuration is unchanged; its rebuilt index includes new build attestation metadata. Both current repository digests were verified against the local images after testing.

Scan options were `--scope squashed -o json --fail-on high`, with application update checks and database auto-update disabled after validating the database. Local raw JSON reports are retained outside the repository. Counts are advisory/package matches, not unique CVEs or independently confirmed exploitable defects. They are not directly comparable with historical Docker Scout counts.

| Assessment | Critical | High | Medium | Low | Negligible | High threshold |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Worker before update | 28 | 144 | 1532 | 67 | 13 | Failed |
| Worker after update | 0 | 7 | 1448 | 67 | 13 | Failed (exit 2) |
| Firewall helper after update | 0 | 0 | 59 | 7 | 2 | Passed (exit 0) |

All 249 prior Firefox matches marked as having available fixes in this database are absent from the updated report: 28 critical, 137 high and 84 medium. No remaining match is marked as having an available fix in this database. This does not mean that every applicable defect has been fixed or that no newer upstream fix exists.

## Remaining findings and activation blockers

- **Probable broad-CPE mismatches:** Firefox records CVE-2007-4013, CVE-2014-6492 and CVE-2009-4102 describe Windows Citrix components, legacy Oracle Java, and the Sage extension respectively. Those products are not part of the reviewed image build inputs or fresh Firefox test profiles. The matches have unknown version constraints; they remain in the raw report without suppression.
- **Unresolved historical Firefox applicability:** CVE-2007-2176 has unspecified JavaScript vectors; CVE-2009-1597 describes historical Firefox/Adobe PDF behavior. Their age and unknown constraints do not prove them fixed in this image. They have not been cleared.
- **GStreamer backport evidence:** the two package records for CVE-2025-3887 retain Ubuntu version `1.24.2-1ubuntu4`. The existing targeted source backport rebuilt successfully; both upstream H.265 tests, the original-versus-patched bounds regression, exported-symbol comparison and installed-library checksum check passed. The installed codec SHA-256 remains `4852034e86f6c92af2ec63acb67caa4438e7ad287932aeecd718309018596727`. Package-version matching cannot recognize this local library repair. See the README for patch provenance; no blanket advisory suppression was added.
- **Newer upstream advisory requiring follow-up:** [Mozilla lists CVE-2026-120572 as fixed in Firefox 159.0.1](https://www.mozilla.org/en-US/security/advisories/mfsa2026-123/), while this bundle reports Firefox 159.0. That CVE is absent from the current Grype result. Its applicability or any vendor backport has not been verified, so scan absence is not clearance. Review a supported Playwright/browser update or verified upstream fix before activation; no independent system-Firefox substitution or custom browser build was introduced.

Medium/low findings have not all been individually cleared. Public execution remains blocked pending review of the remaining browser/image concerns, a separate enabled-path security review and an explicitly approved live smoke test. No risk acceptance or activation switch was added.

## Activation applicability review

Reviewed again November 9, 2026 for the proposed single-page MVP validation. **Decision: no public activation in this branch.** The seven raw high matches remain recorded without suppression or blanket risk acceptance.

The reviewed public execution path imports and launches Chromium in `public-worker.mjs`; it does not select a browser from request data. Firefox and WebKit are launched only by the controlled UI verification harness. Firefox findings therefore describe an installed verification engine, not the engine used to visit submitted pages. This narrows exposure; it does not establish that the shared image or Chromium is free of other vulnerabilities.

A bounded inspection of the assessed arm64 image ran in the existing network-none, read-only, non-root sandbox. It found no Oracle-Java/OpenJDK/Citrix/Sage package entries under the checked package-name prefixes, no Java launcher/JVM/Citrix candidate paths, no named Citrix DLLs in the Firefox distribution, and no bundled Firefox XPI extensions among 53 inspected distribution entries. Alongside the fresh verification profiles and reviewed build inputs, this supports the three third-party-product mismatch classifications above. It is evidence about these products and paths, not an exhaustive filesystem or vulnerability audit.

The two historical Firefox records remain unverified. Mozilla still lists the 159.0.1 fix, while the selected Playwright bundle still reports 159.0. The detailed Mozilla bug is access-restricted, and no verified vendor-backport evidence was obtained. No account access, independent Firefox substitution, manual browser build or additional service was introduced to work around that limitation. The targeted GStreamer library repair remains supported by the recorded build/tests/checksum evidence.

These open questions require a separate activation decision before any live smoke. The proposed smoke and exact approval boundary are in [MVP-VALIDATION.md](MVP-VALIDATION.md). Until then, both public constants remain false; passing controlled tests or having example.com in the candidate allowlist is not permission to contact it.

## Functional and isolation verification

Both image targets and the TypeScript/Vite application build passed. The existing 120 tests passed: 78 unit/API tests, 7 isolated fixture checks, 22 gateway unit checks, 10 controlled gateway/API checks, 2 kernel firewall checks and 1 integration suite covering Chromium 158.0.8127.18, Firefox 159.0 and WebKit 27.2. The worker's Node runtime is v26.13.0. Both npm audits returned zero known vulnerabilities. Owned test containers, socket volumes and networks were absent afterward.

The initial Firefox UI runs exposed [Playwright issue 43967](https://github.com/microsoft/playwright/issues/43967): aria-labelledby reflection across JavaScript worlds crashes the content process. Container diagnostics showed signal 11 and no memory OOM events. Two text-list assertions now retain their role/name selectors and expected values while using per-element textContent reads in the utility world. The full three-engine suite then passed. This test-harness compatibility change does not repair the underlying Firefox defect, remove application accessibility markup, skip assertions, or relax container isolation.

These checks exercise controlled internal origins with injected DNS, not submitted public sites. No real public DNS or valid public TLS smoke was performed. Passing tests and npm audits do not establish browser, kernel, Docker VM or host safety. Keep public capture/scanning disabled until explicit activation approval.
