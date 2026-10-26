---
"@cloudflare/vite-plugin": patch
---

Preserve a Worker response's `statusText` in Vite dev and preview

Responses such as `new Response(body, { status: 231, statusText: "Custom" })` reached the browser with Node's default status text for the code instead (or `unknown` for non-standard codes), because the status text was dropped when the response was written to the Node HTTP response. Updating `@remix-run/node-fetch-server` to 1.0.0 preserves the Worker's `statusText` over HTTP/1.x, including empty status text. HTTP/2 responses are unchanged, since HTTP/2 has no status text.
