---
"@cloudflare/autoconfig": minor
"wrangler": minor
---

Automatically migrate supported Cloudflare Pages Functions projects to Workers

`wrangler setup` and `wrangler deploy` can now convert Pages projects that use a `functions/` directory into Workers. The migration preserves compatible Wrangler settings, creates an editable Worker entrypoint and build script, and installs the Pages Functions compiler.

Projects using custom routing, advanced mode, environment-specific configuration, or the project root as their static asset directory must still be migrated manually.
