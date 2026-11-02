---
"@cloudflare/vite-plugin": minor
---

Expose `CloudflareConfig` and deprecate `ParsedInputConfigWithWorker` in the beta Vite plugin

Import `CloudflareConfig` from `@cloudflare/vite-plugin` to annotate configuration customizers. The previous name, `ParsedInputConfigWithWorker`, remains exported as a deprecated alias for compatibility. The configuration shape and required entry Worker remain unchanged.
