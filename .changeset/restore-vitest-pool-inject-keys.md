---
"@cloudflare/vitest-pool-workers": patch
---

Restore typed `inject()` keys in `cloudflareTest()` pool options

`inject()` inside `cloudflareTest()` options again infers the value type from the keys you declare in your Vitest `ProvidedContext`, and reports misspelled keys. For keys that are only provided at runtime, pass an explicit type argument, e.g. `inject<number>("myPort")`.
