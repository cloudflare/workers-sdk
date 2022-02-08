---
"wrangler": patch
---

refactor: use esbuild's message formatting for cleaner error messages

This is the first step in making a standard format for error messages. For now, this uses esbuild's error formatting, which is nice and colored, but we could decide to customize our own later. Moreover, we should use the `parseJSON`, `parseTOML`, and `readFile` utilities so there are pretty errors for any configuration.
