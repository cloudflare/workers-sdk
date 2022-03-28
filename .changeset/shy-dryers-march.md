---
"wrangler": patch
---

feat: Non-interactive mode

Continuing the work from https://github.com/cloudflare/wrangler2/pull/325, this detects when wrangler is running inside an environment where "raw" mode is not available on stdin, and disables the features for hot keys and the shortcut bar. This also adds stubs for testing local mode functionality in `local-mode-tests`, and deletes the previous hacky `dev2.test.tsx`.

Fixes https://github.com/cloudflare/wrangler2/issues/322
