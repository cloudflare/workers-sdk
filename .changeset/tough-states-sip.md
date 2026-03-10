---
"@cloudflare/quick-edit": patch
---

Add frame-ancestors CSP and postMessage origin validation to quick-edit

Mitigate `postMessage` origin bypass:

- Add Content-Security-Policy frame-ancestors header to quick-edit Worker responses, restricting which origins can embed the editor iframe
- Add client-side origin validation to the window.onmessage handler in workbench.ts, rejecting PORT messages from untrusted origins
- Inject allowed parent origins from server into HTML for client-side use
- Localhost origins are conditionally included when running via wrangler dev
