---
"wrangler": patch
---

Fix autoconfig for Astro 6+ projects to skip wrangler config generation

Astro 6+ generates its own wrangler configuration on build, so autoconfig now detects the Astro version and skips creating a `wrangler.jsonc` file for projects using Astro 6 or later. This prevents conflicts between the autoconfig-generated config and Astro's built-in config generation.
