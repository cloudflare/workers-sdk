---
"@cloudflare/vite-plugin": patch
---

Fix SyntaxError when SSR-transformed module ends with a single-line comment

When module code ends with a `//` comment (e.g. `//# sourceMappingURL=...` preserved by vite-plus), the closing `}` of the async wrapper in `runInlinedModule` was absorbed into the comment, causing `SyntaxError: Unexpected end of input`. Adding a newline before the closing brace prevents this.
