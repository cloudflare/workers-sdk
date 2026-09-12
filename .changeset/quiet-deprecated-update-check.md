---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/workers-utils": patch
---

Stop the update check from recommending deprecated versions

Previously, the "update available" notice shown by `wrangler` and `@cloudflare/vite-plugin` always pointed at whichever version was tagged `latest` on npm, even after that version had been deprecated for shipping a bug. Deprecated versions are now never recommended: if the latest release has been deprecated, the newest non-deprecated stable release below it is suggested instead, or nothing at all if you are already on it.

The check now reads the npm registry directly instead of going through the `update-check` package, which discarded the deprecation information. The on-disk cache location and one-hour refresh interval are unchanged.
