---
"wrangler": patch
---

Add backward-compatible autoconfig support for Astro v5 and v4 projects

The `astro add cloudflare` command in older Astro versions installs the latest adapter version, which causes compatibility issues. This change adds manual configuration logic for projects using Astro versions before 6.0.0:

- **Astro 6.0.0+**: Uses the native `astro add cloudflare` command (unchanged behavior)
- **Astro 5.x**: Installs `@astrojs/cloudflare@12` and manually configures the adapter
- **Astro 4.x**: Installs `@astrojs/cloudflare@11` and manually configures the adapter
- **Astro < 4.0.0**: Returns an error prompting the user to upgrade
