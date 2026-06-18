---
"@cloudflare/autoconfig": minor
---

Add support for React Router >= 8.0.0

React Router v8 enables `viteEnvironmentApi` and `middleware` by default, so autoconfig no longer adds `future` flags to `react-router.config.ts` for v8+ projects and uses the middleware code pattern unconditionally.
