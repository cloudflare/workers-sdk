---
"@cloudflare/autoconfig": patch
---

Require React Router 8.5.1 or later when configuring a project for `cf`

React Router projects on earlier versions build into the wrong output directories for the Cloudflare Vite plugin v2, so `cf build` failed later with an unclear missing-file error. Autoconfig now stops before changing anything and asks you to update React Router to 8.5.1. Projects configured for Wrangler keep the existing minimum of 7.0.0.
