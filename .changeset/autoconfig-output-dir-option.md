---
"@cloudflare/autoconfig": minor
---

Add an `outputDir` option to `getDetailsForAutoConfig`

Callers that already know which directory holds their built static assets can pass it as `outputDir` instead of having autoconfig detect one. Relative paths are resolved against the project path. This selects static-asset configuration for unconfigured projects even when framework dependencies are present, without running framework migrations or builds that could replace the requested assets. Existing Workers and Pages configurations, including deployments configured through the Cloudflare Vite plugin alone, retain their usual detection behavior.

Checking whether a Vite project already uses the Cloudflare plugin no longer writes the Vite config back to disk, preserving its line endings and trailing newline.
