---
"@cloudflare/runtime-types": patch
---

Use a reserved `.invalid` domain for runtime type generation

`wrangler types` dispatched runtime type generation to `http://dummy.com/...`, which is a real, publicly registered domain. A misrouted request could download arbitrary web content into the generated `.d.ts`. The dispatch URL now uses `dummy.invalid` (RFC 2606), which can never resolve, so such requests fail closed instead.
