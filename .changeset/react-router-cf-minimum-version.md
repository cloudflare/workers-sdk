---
"@cloudflare/autoconfig": patch
---

Support React Router on `cf` from version 8.5.1

React Router 8.5.1 builds into the output directories that the Cloudflare Vite plugin v2 uses, which `cf` needs. Autoconfig now requires React Router 8.5.1 or later when configuring a project for `cf`, and stops with a clear message on earlier versions instead of letting `cf build` fail later. Projects configured for Wrangler keep the existing minimum of React Router 7.0.0.
