# Real website preview validation

## Approved scope

One anonymous scan-and-capture attempt per HTTPS homepage below, through the default local API and existing KindPath interface. The selected sample draws from [Similarweb’s August 2026 popular-site listing](https://www.similarweb.com/blog/research/market-research/most-visited-websites/); it is not a claim to be the ranked top twenty. No sign-in, paid service, crawl, automatic retry or deployment is included. Page redirects and resources remain subject to the current public-target, DNS, TLS, firewall and resource policies.

- `https://google.com/`
- `https://youtube.com/`
- `https://facebook.com/`
- `https://instagram.com/`
- `https://x.com/`
- `https://reddit.com/`
- `https://bing.com/`
- `https://tiktok.com/`
- `https://wikipedia.org/`
- `https://amazon.com/`
- `https://yahoo.com/`
- `https://linkedin.com/`
- `https://netflix.com/`
- `https://pinterest.com/`
- `https://microsoft.com/`
- `https://duckduckgo.com/`
- `https://github.com/`
- `https://apple.com/`
- `https://spotify.com/`
- `https://bbc.com/`

Temporarily enable both public features only for this bounded local batch; restore both to false on completion or early stop. Verify matching assessed image identities and absence of owned resources before activation. Run serially, verifying scanner cleanup before accepting each outcome and starting the next attempt. Stop on unconfirmed cleanup, isolation/policy violation, identity mismatch or unexpected API failure. Do not weaken limits to obtain a result.

## Acceptance and limitations

On success, verify public report mode, request/final URL labels and report/snapshot identity. Compare both preview panels against the returned sanitized snapshot, without assuming the live page contains particular wording. Check empty iframe sandbox, opaque origin, guarded inert content, absence of navigation/resource attributes and executable elements, disabled controls, link hover/click without navigation, and modified-panel-only vision effects with keyboard pause/reset. Check report export and print exclude preview HTML and ephemeral scan identity. Record resource and capture omissions.

A failed scan ends that URL’s attempt with no partial report. A successful API response is separate from a completed UI verification. Raw responses, screenshots and temporary harness code remain outside the repository. Existing controlled tests cover security and cases absent from individual live captures.

Previews are bounded structural approximations. Images, scripts, frames, embedded advertisements, custom fonts, form values and unsupported styles/structure are omitted. A login, consent or challenge page does not assess the authenticated service. Single-page findings and a recognizable preview do not establish full fidelity, site-wide coverage or accessibility conformance. No universal isolation guarantee follows from these checks.

Status: planned; no live attempts for this batch have run.
