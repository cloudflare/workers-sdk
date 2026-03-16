---
"create-cloudflare": patch
---

Fix React app creation flow skipping Cloudflare setup

Creating a React app with create-cloudflare no longer allows the Cloudflare setup step to be skipped by accepting create-vite's `Install and start now` prompt.
