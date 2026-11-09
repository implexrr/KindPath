# Local container image assessment

Assessed November 9, 2026. **Public capture and scanning remain disabled. The worker failed the high-severity threshold; this is not approval for activation.**

## Method and exact images

The free, local [Anchore Grype](https://github.com/anchore/grype) v0.121.2 scanner inspected the squashed filesystems of both arm64 images. Its release archive was verified against the published SHA-256 and GitHub asset digest. Image/package inventories were not sent to a cloud scanning service. Only public tool releases and the vulnerability database were downloaded. There was no subscription, trial or paid operation.

- Worker arm64 configuration digest (Grype `imageID`): `sha256:d328ffb1639e0758199361abcb47a476680e2b970e13f54c0daa3f66463f526c`
- Firewall helper arm64 configuration digest (Grype `imageID`): `sha256:ed7936dcb3be22ca4f6e77959fefee4003ee43c59f7ab1771229650a20f9b1e8`
- Worker OCI index/repository digest: `sha256:88f0a58076a0a91d53b1d550165770cbffa151e13fd8dd93a3a8b50718d3105c`.
- Firewall helper OCI index/repository digest: `sha256:ff2712902b06eee7043b4217e37077b806c28fd5507386136d89b95023ce2fec`.
- Database schema: `v6.1.10`; built `2026-11-08T06:19:57Z`, validated by Grype.
- Database archive SHA-256: `dcca24722e16c2bcf4a542a3f7fdd2147baf9215c17b973f5a7d4243fbddacea`.

Docker’s local image store reports the OCI index digest as its image ID. Grype reports the selected platform’s configuration digest separately; compare repository digests when binding its report to these local tags.

Scan options were `--scope squashed -o json --fail-on high`, with application update checks and database auto-update disabled after downloading and validating the database. Local raw JSON reports were retained outside the repository. Counts below are advisory/package matches, not independently confirmed exploitable defects or unique CVEs. They are not directly comparable with the previous Docker Scout counts.

| Image | Critical | High | Medium | Low | Negligible | High threshold |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Worker | 28 | 144 | 1532 | 67 | 13 | Failed (exit 2) |
| Firewall helper | 0 | 0 | 59 | 7 | 2 | Passed (exit 0) |

## Triage and remaining work

All worker high/critical matches concern the bundled Firefox 157.0 except two package records for GStreamer CVE-2025-3887. Firefox is used by the isolated UI verification suite; submitted-page workers launch Chromium. Its presence still matters to image maintenance, and absence of a Chromium finding is not proof that Chromium is current or safe.

Of the 170 Firefox high/critical matches, 165 list newer fixed versions and five have unknown version constraints. The current bundle is older than upstream security fixes. For example, [Mozilla's Firefox 159 advisory](https://www.mozilla.org/en-US/security/advisories/mfsa2026-118/) includes CVE-2026-117861, which is also present in the local report. This finding must not be dismissed as a blanket false positive. Some older CPE matches instead describe third-party Java/Citrix/plugin products; these require individual applicability review, not automatic suppression.

Update Playwright and its matching pinned browser image together, review their release changes, rebuild and repeat the affected checks and image assessment before considering activation. [Playwright requires version-specific browser binaries](https://playwright.dev/docs/browsers); independently substituting a system Firefox is not a supported fix. No dependency/image upgrade or architectural split is part of this assessment commit.

The two GStreamer package records retain Ubuntu's original package version. The existing targeted source backport, parser regression results, patch provenance and installed-library checksum provide separate evidence for that advisory; see the README's container maintenance section. Grype's package-version matches alone neither verify nor invalidate that backport. No advisory suppression was added. Medium/low findings have not all been individually triaged or cleared.

Both npm dependency audits returned zero known vulnerabilities, and the controlled functional/isolation suites passed. These checks do not replace image remediation, a separate activation review, or an explicitly approved live smoke test. Public DNS, a valid public TLS connection and actual public-page behavior remain untested. No container/browser/VM isolation guarantee follows from a passing test suite or scanner report.
