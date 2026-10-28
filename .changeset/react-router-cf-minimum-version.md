---
"@cloudflare/autoconfig": patch
---

Require `@react-router/dev` 8.5.1 or later when configuring a React Router project for `cf`

With earlier versions, React Router builds into output directories that the Cloudflare Vite plugin v2 doesn't use, so `cf build` fails later with an unclear missing-file error. Autoconfig now stops before changing anything and asks you to update `react-router` and `@react-router/dev` to 8.5.1. Projects configured for Wrangler keep the existing minimum of React Router 7.0.0.
