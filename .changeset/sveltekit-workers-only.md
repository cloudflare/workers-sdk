---
"create-cloudflare": minor
---

Scaffold SvelteKit projects for Workers only

The SvelteKit Cloudflare adapter no longer supports Pages. Use `--framework svelte --platform workers` to create a new project, or omit `--platform` to select Workers automatically. The adapter now sets the Worker entry point and assets directory at build time. Existing projects are not modified.
