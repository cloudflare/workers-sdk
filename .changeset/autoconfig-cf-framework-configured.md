---
"@cloudflare/autoconfig": minor
---

Set up the framework of cf projects that only have a `cloudflare.config.ts`

A `cloudflare.config.ts` alone, such as one written by `cf migrate`, no longer marks a project as configured when autoconfig can set up its framework for cf: for example, a migrated Astro project now gets the Cloudflare adapter. Setup merges into the existing `cloudflare.config.ts`, keeping its bindings, Worker name and compatibility date.
