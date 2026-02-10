---
"@cloudflare/vite-plugin": patch
---

fix: Avoid `The WebSocket is undefined` error when frameworks create a child Vite server during build

Frameworks like React Router create a child Vite dev server during production builds to compile route files. This could cause an intermittent `The WebSocket is undefined` assertion error that breaks the build.
