---
"@cloudflare/vite-plugin": patch
---

Avoid `The WebSocket is undefined` error when frameworks create a child Vite server during build

React Router creates a child Vite dev server during production builds to compile route files. This could previously cause an intermittent `The WebSocket is undefined` assertion error.
