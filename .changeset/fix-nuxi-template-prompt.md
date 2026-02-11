---
"create-cloudflare": patch
---

fix: bump nuxi to 3.33.1 and fix E2E tests for new interactive template prompt

nuxi 3.31.0+ added an interactive template selection prompt to `nuxi init`. The E2E tests now pass `--template minimal` via flags to skip this prompt, matching the pattern used by Astro and Svelte. Also updates the modules prompt matcher to handle the new wording.
