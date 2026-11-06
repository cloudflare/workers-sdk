---
"miniflare": patch
"@cloudflare/vitest-plugin": patch
"wrangler": patch
---

Update bundled third-party dependencies with known security fixes

Local development and Workers Vitest tests now include security fixes for their bundled dependencies. Local browser rendering also includes security fixes for browser downloads, archive extraction, and proxy support.

Miniflare and Wrangler now require Node.js 22.12.0 or later, matching the supported runtime range of the new browser installer.
