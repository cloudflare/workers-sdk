---
"@cloudflare/autoconfig": minor
---

Only treat a cf project as configured once its framework is set up for cf

A `cloudflare.config.ts` alone no longer marks a project as configured when autoconfig can set up its framework for cf. For example, an Astro project migrated with `cf migrate` now gets the Cloudflare adapter, and a React Router project gets the Cloudflare Vite plugin. Static sites, plain Workers, Next.js, and frameworks that autoconfig cannot set up for cf are still configured by `cloudflare.config.ts` alone. The new `requiresFrameworkSetup()` export tells callers which frameworks this applies to.
