---
"create-cloudflare": patch
---

Use Vitest 5 in newly generated Workers projects

Workers templates now install Vitest 5 and require @cloudflare/vitest-plugin 1.4.3 or newer, which supports Vitest's filesystem module cache.
