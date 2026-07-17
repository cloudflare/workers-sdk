---
"@cloudflare/workers-shared": patch
"@cloudflare/deploy-helpers": patch
---

Surface `_redirects` validation warnings at `wrangler deploy` time

Previously, invalid `_redirects` rules (e.g. a duplicate rule for the same path, or a file that exceeds the 100-rule dynamic-rule budget and has its remaining lines silently dropped) were only reported as a warning in `wrangler dev`. `wrangler deploy` uploaded the raw `_redirects` file without any client-side validation, so the same issues went completely unreported at deploy time.

`wrangler deploy` now parses `_redirects` for validation purposes and warns about any invalid rules, using the same messages already shown by `wrangler dev`. This does not change what gets uploaded — the raw file is still uploaded as-is, and the asset worker remains the authoritative parser at runtime.

