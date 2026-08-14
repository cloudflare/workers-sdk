---
"@cloudflare/autoconfig": minor
---

Expose development commands in project detection

`getDetailsForAutoConfig()` now returns the detected development command. It no longer accepts Wrangler configuration or reports whether a project is configured. Callers must determine configuration status separately. `outputDir` may be undefined when no output directory is detected.
