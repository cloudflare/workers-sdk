---
"@cloudflare/autoconfig": minor
---

Set up Hono projects for cf

Previously, autoconfig refused every Hono project on cf. A Hono project that already deploys with a Wrangler configuration file now needs no setup, because the Wrangler migration brings its Worker entry point over, and one that builds with the Cloudflare Vite plugin is set up as a Vite project. A Hono project without either is still refused, now with steps to deploy it. The Wrangler target is unchanged.
