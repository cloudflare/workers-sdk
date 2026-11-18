---
"@cloudflare/autoconfig": patch
---

Keep the Worker of Astro projects that bring their own Worker entrypoint on cf

With static output, the Cloudflare adapter builds only assets and leaves a custom Worker entrypoint out of the build, so these projects deployed without their Worker. When the project's Worker configuration sets its own entrypoint, the Astro setup for cf now switches the Astro config to `output: "server"`. It also explains what the Worker needs: pass the requests it doesn't handle to Astro through `@astrojs/cloudflare/entrypoints/server`, and mark pages that should stay static files with `export const prerender = true`.
