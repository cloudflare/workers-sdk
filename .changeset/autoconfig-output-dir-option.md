---
"@cloudflare/autoconfig": minor
---

Add an `outputDir` option to `getDetailsForAutoConfig`

Callers that already know which directory holds a static project's assets can pass it as `outputDir` instead of having autoconfig detect one. Relative paths are resolved against the project path. The option applies to projects detected as static; projects using a framework keep the framework's own build output directory.
