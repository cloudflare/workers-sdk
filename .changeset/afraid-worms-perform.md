---
"wrangler": patch
---

feat: pass env value as `CLOUDFLARE_WRANGLER_ENV` to custom builds

When running custom builds, it's useful to know what the name of the environment actually is (for example, to apply minification, or choose a localisation, etc). This feature passes the name of the environment as a process level environment variable to custom builds.
