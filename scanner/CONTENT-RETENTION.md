# Preview content retention

## Verified problem and bounded fix

The controlled indented-content page reproduced a capture-budget problem: indentation text nodes used the 250-node output budget, and a later heading was omitted. The regression failed before the change and passed afterward. This establishes a specific formatting case; it does not explain the historical popular-site captures.

The capture now discards short, whitespace-only text nodes made solely of ASCII spaces, tabs and line breaks when they sit between, or at the edge of, normal-flow block siblings and their parent uses normal or nowrap whitespace handling. Neighbors must pass the existing tag, hidden-attribute, display and visibility checks and remain block-level without copied styles; spacing near omitted or hidden nodes and native inline elements styled as blocks is retained. Candidates are bounded to 4,000 characters. Inline word separators, preformatted whitespace, nonbreaking spaces and whitespace beside out-of-flow positioned or floated elements are preserved. Whitespace-only containers and uncertain cases retain the earlier behavior.

Discarded formatting nodes still count toward the 1,000-node traversal limit. The 250-node capture limit, depth 15, 8,000-character worker text budget, 20,000-character style budget and independent host validation remain unchanged. The larger indented-budget fixture still truncates and reports omissions. The existing hidden-attribute, display-none and visibility checks still apply; native form values remain excluded, and returned form controls remain inactive. No extra source tags, attributes, CSS properties, shadow DOM, scripts, images or embedded content are admitted.

## Scope and limits

This retains more useful text in the reproduced case without raising resource limits. It does not repair unsupported wrappers, layout/style omissions, off-screen content or general visual fidelity. Formatting normalization is not a score or proof of completeness. The earlier [twenty-site validation](WEBSITE-PREVIEW-VALIDATION.md) remains historical evidence; no live site was retried and no improvement on those sites is claimed.

Both public scanning and capture remain disabled. Controlled routes are fixed internal test origins, with injected DNS and the existing isolated gateway; they make no public-site requests. No dependency, service, account, purchase or deployment is introduced.

## Verification

The focused content-loss case failed before the fix and passed after it. The two new integration cases cover later-heading retention, inline and inline-block separators, preformatted line breaks, nonbreaking spaces, out-of-flow spacing, separators around omitted/hidden blocks, hidden content/form-value exclusion, inactive controls, and a larger page that still truncates.

Final local checks passed: 161 controlled tests (108 unit/API, 7 scanner, 25 gateway unit, 17 gateway integration, 3 firewall and 1 Chromium/Firefox/WebKit suite), the TypeScript/Vite production build, all three image builds, and both npm audits with zero known vulnerabilities. The [image assessment](IMAGE-ASSESSMENT.md) binds the exact rebuilt image identities to local cached-database scans. Scanner and firewall images have zero critical/high matches; QA retains its seven documented high matches without suppression or acceptance. The cached database is not a fresh advisory-feed check.

A fresh default API confirmed both public capabilities false and rejected public scanning before DNS/Docker. Final daemon queries confirmed no owned fixture/public/QA containers, socket volumes or scanner networks, and all three tags matched their assessment reports. No live request, push, merge or purchase was made.

## Review correction

The initial rule could discard a separator between source block elements that the capture later omitted. A controlled regression reproduced joined words around unsupported wrappers. The correction also applies the existing hidden-attribute and visibility checks before treating a neighbor as a retained block. The rule now requires supported block tags that pass those capture checks, with native block layout preserved even if copied styles run out. Updated fixtures retain both separators while the content-retention and larger-page budget cases continue to pass. This correction does not expand the capture allowlist or change resource limits.

During the review checks, one gateway run did not establish the intended forbidden-redirect rejection. The isolated policy test and complete gateway rerun subsequently passed without changing limits or skipping checks. The initial failure’s cause was not established from the retained output.
