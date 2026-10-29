---
"@cloudflare/platform-proxy": minor
---

Add the `@cloudflare/platform-proxy` package

`getPlatformProxy()` emulates the bindings declared in a project's `cloudflare.config.ts` from Node.js, so that code running outside the Workers runtime during local development, such as a framework's dev server, can use them as its Worker would. It returns the Worker's bindings together with stand-ins for `cf`, `ctx` and `caches`, and persists binding data to `.cloudflare/state`, like the Cloudflare Vite plugin. Secrets, remote bindings and the `assets` binding aren't supported yet.
