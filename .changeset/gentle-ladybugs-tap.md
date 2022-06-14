---
"wrangler": patch
---

fix: resolve asset handler for `--experimental-path`

In https://github.com/cloudflare/wrangler2/pull/1241, we removed the vendored version of `@cloudflare/kv-asset-handler`, as well as the build configuration that would point to the vendored version when compiling a worker using `--experimental-public`. However, wrangler can be used where it's not installed in the `package.json` for the worker, or even when there's no package.json at all (like when wrangler is installed globally, or used with `npx`). In this situation, if the user doesn't have `@cloudflare/kv-asset-handler` installed, then building the worker will fail. We don't want to make the user install this themselves, so instead we point to a barrel import for the library in the facade for the worker.
