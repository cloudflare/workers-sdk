---
"@cloudflare/vite-plugin": patch
"create-cloudflare": patch
"miniflare": patch
"wrangler": patch
---

Update the local Workers runtime to workerd 1.20261016.1

Use matching Workers types and a default compatibility date of 2026-10-16. Preserve nested asset serving on Windows by normalizing filesystem paths before building asset URLs.

The following dependency versions have been updated:

| Dependency                | From          | To            |
| ------------------------- | ------------- | ------------- |
| @cloudflare/workers-types | ^5.20261006.1 | ^5.20261016.1 |
| workerd                   | 1.20261012.1  | 1.20261016.1  |
