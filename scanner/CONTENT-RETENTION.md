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

At the earlier whitespace-only milestone, local checks passed: 161 controlled tests (108 unit/API, 7 scanner, 25 gateway unit, 17 gateway integration, 3 firewall and 1 Chromium/Firefox/WebKit suite), the TypeScript/Vite production build, all three image builds, and both npm audits with zero known vulnerabilities. The [image assessment](IMAGE-ASSESSMENT.md) binds the exact rebuilt image identities to local cached-database scans. Scanner and firewall images have zero critical/high matches; QA retains its seven documented high matches without suppression or acceptance. The cached database is not a fresh advisory-feed check.

A fresh default API confirmed both public capabilities false and rejected public scanning before DNS/Docker. Final daemon queries confirmed no owned fixture/public/QA containers, socket volumes or scanner networks, and all three tags matched their assessment reports. No live request, push, merge or purchase was made.

## Review correction

The initial rule could discard a separator between source block elements that the capture later omitted. A controlled regression reproduced joined words around unsupported wrappers. The correction also applies the existing hidden-attribute and visibility checks before treating a neighbor as a retained block. The rule now requires supported block tags that pass those capture checks, with native block layout preserved even if copied styles run out. Updated fixtures retain both separators while the content-retention and larger-page budget cases continue to pass. This correction does not expand the capture allowlist or change resource limits.

During the review checks, one gateway run did not establish the intended forbidden-redirect rejection. The isolated policy test and complete gateway rerun subsequently passed without changing limits or skipping checks. The initial failure’s cause was not established from the retained output.


## Component text and body appearance — November 10, 2026

Two additional controlled fixtures reproduced separate losses before the new change: a light-DOM component wrapper caused the complete guide to be omitted, and missing body CSS left a dark page's light text without its original background. Both cases failed against the previous collector and passed after the bounded changes. These fixtures do not identify the causes of historical popular-site failures.

- Component host elements are normalized to existing inert div/span output. Traversal stays in light DOM. Layout-box checks on normalized components and their descendants, and text-range checks for their non-whitespace text, exclude the fixtures' unassigned/unrendered content behind open/closed shadow roots. This is not a general visibility/fidelity proof: clipping, opacity, overlays and later dynamic changes can still differ.
- Passive b/i/pre/code/time markup is retained by matching worker and host allowlists. Scripts, stylesheets, textarea/select values, embedded frames, graphics and raw component tags remain excluded from serialized output. Input values and event/resource attributes are not copied; returned controls remain inactive.
- Optional raw bodyStyle metadata preserves supported body colours, geometry and typography. It uses the existing worker style budget and is independently checked against the same host CSS allowlist before entering the iframe stylesheet. Missing metadata retains the previous fallback. No source stylesheet text, URLs or arbitrary CSS is accepted.
- The 250-node capture budget, 1,000-node traversal budget, depth15, 8,000-character text budget, 20,000-character worker style budget and host limits are unchanged. Body styles have priority within that same style budget, so later descendant styles may be omitted sooner and remain counted. No shadow-root traversal, image/network resource capture, dependency or public activation was added.

The older spacing fixture used custom tags as its deliberately omitted elements. Custom light-DOM tags are now intentionally retained, so that fixture uses excluded canvas elements instead. The original omission/word-spacing assertions remain in place, including the larger-page truncation case. Hidden-content and form-value exclusions remain tested.

Rendering checks separately exercise validated retained-text/body-style snapshots in the existing network-disabled Chromium/Firefox/WebKit interface suite. They verify readable body colours, spacing, passive text/code markup, inert resources and unchanged original-panel rendering when presets are applied. Real-page capture quality remains unverified for this change; public scanning and capture stay disabled.

Implementation-stage content-quality checks passed: 184 controlled tests (119 unit/API, 7 scanner, 25 gateway unit, 29 gateway integration, 3 firewall and 1 Chromium/Firefox/WebKit suite), TypeScript/Vite build, all three image builds and both npm audits with zero known vulnerabilities. Actual captures of both new controlled pages were separately rendered through the host mapper in an opaque, network-disabled iframe and visually inspected; links remained inert and no resource requests were issued. This direct rendering check used Chromium; the shared application rendering checks passed in all three engines.

The refreshed [image assessment](IMAGE-ASSESSMENT.md) records unchanged cached-database counts for these exact builds: runtime/helper zero critical/high, QA seven existing high matches, with none suppressed or accepted. A fresh default API reported both capabilities false and rejected public scanning; owned test containers, networks and socket volumes were absent. No public request, push, merge or purchase was made.


## Review correction — paragraph grouping

A controlled source paragraph containing a block-styled component had text BeforeInsideAfter. Serializing that component as a div implicitly closed its surrounding paragraph: the parsed snapshot's first paragraph contained only Before and an extra paragraph appeared. Component hosts inside paragraph ancestors now use inert spans; validated display styling preserves their block box without changing the HTML parser's grouping. Output allowlists, resource limits and iframe restrictions are unchanged.

The component fixture checks the collector's wrapper choice. The shared three-engine rendering checks inspect the parsed paragraph text and block display, rather than relying only on a substring in serialized HTML. The original before/after probe remains separate controlled evidence; no live site was retried for this review.

The post-fix controlled probe retained BeforeInsideAfter in one paragraph; the pre-fix snapshot had only Before in its first paragraph and two paragraph elements. Fresh review checks passed all 184 controlled tests, the build, image builds and dependency audits. The firewall fixture now establishes origin availability before applying its original filtering assertions. Exact rebuilt image identities and unchanged cached advisory counts are recorded in the assessment. Both public features remain disabled; no new live request was made.
