---
"@cloudflare/vite-plugin": minor
---

Preserve Vite environment output directories when emitting the experimental Build Output Specification

The Build Output `assets/` and `bundle/` directories now link to the completed client and entry Worker environment outputs instead of overriding their configured `outDir` values. This allows framework build orchestration such as React Router to continue using its configured output paths.
