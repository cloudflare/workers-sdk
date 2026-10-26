---
"@cloudflare/vite-plugin": patch
---

Preserve a Worker response's `statusText` in Vite dev and preview

Responses such as `new Response(body, { status: 231, statusText: "Custom" })` now reach the browser as `231 Custom` instead of `231 unknown`. Empty status text is also preserved over HTTP/1.x.
