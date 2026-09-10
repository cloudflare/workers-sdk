---
"wrangler": patch
---

Bump `shell-quote` to 1.9.0+ to pick up two disclosed advisories

`shell-quote@1.8.1` is affected by a ReDoS in `parse()` (CVE-2026-13311 / GHSA-395f-4hp3-45gv — an unauthenticated attacker who can feed a string into `parse()` can block the event loop for tens of seconds with plain space-separated input, no shell metacharacters required) and by an object-token escaping bug in `quote()` (CVE-2026-9277 / GHSA-w7jw-789q-3m8p), both fixed upstream in `1.9.0`. Wrangler's `parse()` wrapper (`src/utils/shell-quote.ts`) is reachable from `pages dev`/`init` command-line parsing, so the ReDoS applies; the `quote()` call site only ever passes string arguments, so the object-token issue was not reachable here, but there is no reason to stay on a vulnerable range once a patch exists.
