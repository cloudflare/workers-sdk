---
"miniflare": patch
---

Fix `Miniflare: HTTPS fetches using browser CA certificates` test to use a stable URL

The test fetched `https://workers.cloudflare.com/cf.json` from inside a worker and asserted the response was OK. That URL now permanently 301s to `https://www.cloudflare.com/cf.json` which returns a 404, so the test failed on every CI run regardless of the change under test.

Switch the test to `https://example.com/`, the IANA-maintained stable test endpoint, which is more appropriate for verifying that workerd trusts a public CA chain.

This is a test-only change; no Miniflare runtime behaviour changes.
