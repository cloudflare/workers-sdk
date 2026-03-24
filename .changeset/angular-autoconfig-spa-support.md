---
"wrangler": patch
---

fix: Angular auto-config now correctly handles projects without SSR configured

Previously, running `wrangler deploy` (or `wrangler setup`) on a plain Angular SPA (created with `ng new` without `--ssr`) would crash with `Cannot set properties of undefined (setting 'experimentalPlatform')`, because the auto-config code unconditionally assumed SSR was configured.

Angular projects without SSR are now treated as assets-only deployments: no `wrangler.jsonc` `main` entry is generated, `angular.json` is not modified, no `src/server.ts` is created, and no extra dependencies are installed.
