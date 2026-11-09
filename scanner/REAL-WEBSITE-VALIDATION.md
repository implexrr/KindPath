# Report-only real website validation

Status: prepared; live attempts have not run. Public scanning and capture are disabled in the committed configuration.

## Scope

Validate the existing URL-to-report flow, using anonymous sessions and one attempt per approved HTTPS homepage:

- `https://google.com/`
- `https://github.com/`
- `https://martinfowler.com/`
- `https://designgurus.io/`
- `https://instagram.com/`

Temporarily enable only `PUBLIC_SCANNING_ENABLED` in the local working tree. Keep `PUBLIC_CAPTURE_ENABLED` false throughout. Use the default local API and existing isolated scanner, including approved public redirects/resources and current limits. No crawl, sign-in, retries, policy bypass, paid service or deployment is part of this validation. The earlier snapshot smoke is recorded separately in [MVP-VALIDATION.md](MVP-VALIDATION.md).

## Acceptance and restoration

1. Verify assessed images and absence of owned leftover resources before activation.
2. Submit each exact URL through the KindPath interface once. Check a successful public report's request/final URL labels, displayed findings or honest empty state, manual-review guidance and resource limitations. A served landing/login/challenge page is not evidence about authenticated content or the entire site.
3. Confirm scanner resource cleanup before accepting each result. On failure, require a clear error and no partial report. Stop on policy, isolation or unconfirmed-cleanup failure; do not weaken safeguards to obtain a result.
4. After every outcome, stop the temporary API after active work and cleanup settle, restore scanning to false, and confirm capture stayed false. Start a fresh default API and check both disabled capabilities and HTTP 503 / `PUBLIC_SCANNING_DISABLED`. Verify resource absence separately.
5. Record sanitized outcomes and checks. Keep raw responses, screenshots, temporary activation code and local paths outside committed files. Further attempts require approval; a failed attempt must not be presented as successful validation.
