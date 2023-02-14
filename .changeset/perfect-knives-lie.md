---
"wrangler": patch
---

Fix: Upgraded to ES2022 for improved compatibility
Upgraded worker code target version from ES2020 to ES2022 for better compatibility and unblocking of a workaround related to issue #2029. The worker runtime now uses the same V8 version as recent Chrome and is 99% ES2016+ compliant. Tested and verified successful on a project.
