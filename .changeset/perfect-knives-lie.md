---
"wrangler": patch
---

Fix: Upgraded to ES2022 for improved compatibility
Upgraded worker code target version from ES2020 to ES2022 for better compatibility and unblocking of a workaround related to issue #2029. The worker runtime now uses the same V8 version as recent Chrome and is 99% ES2016+ compliant. The only thing we don't support on the Workers runtime, the remaining 1%, is the ES2022 RegEx feature as seen in the compat table for the latest Chrome version.

Compatibility table: https://kangax.github.io/compat-table/es2016plus/

resolves #2716
