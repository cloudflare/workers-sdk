---
"@cloudflare/autoconfig": patch
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-auth": patch
"@cloudflare/workers-utils": patch
---

Fix package.json exports condition order

Put the `types` export condition first.

["types" - can be used by typing systems to resolve the typing file for the given export. This condition should always be included first.](https://nodejs.org/api/packages.html#community-conditions-definitions)
