---
"miniflare": minor
"@cloudflare/vitest-plugin": patch
"wrangler": minor
---

Update bundled third-party dependencies with known security fixes

Local development and Workers Vitest tests now include security fixes for their bundled dependencies. Browser rendering now bundles `@puppeteer/browsers` 3 instead of 2, removing the affected archive and proxy implementations.

Miniflare and Wrangler now require Node.js 22.12.0 or later, matching the supported runtime range of the new browser installer.
