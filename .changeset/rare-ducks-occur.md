---
"@cloudflare/vite-plugin": minor
---

Add support for applications that use the entry Worker during development but not at build time

Some frameworks, such as Astro, use the `ssr` environment during development but omit it from the build if the app is fully static. In these cases, we now output an assets only version of the user's input Wrangler config to the output config in the client output directory.
