---
"create-cloudflare": patch
---

fix: remove unnecessary step in qwik templates

The step that modifies the `src/entry.cloudflare-pages.tsx` file doesn't seem to change the file in any way anymore, so it's been removed
