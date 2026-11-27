---
"@cloudflare/autoconfig": patch
---

Detect Pages projects for cf from their Wrangler config

For cf, detection only checked `pages_build_output_dir` in a Wrangler config passed by the caller, so a Pages project was set up as a new Worker. Detection now also checks the project's own Wrangler config, and setup stops as it does for other Pages projects.
