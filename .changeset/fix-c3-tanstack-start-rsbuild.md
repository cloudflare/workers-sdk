---
"create-cloudflare": patch
---

Install `@rsbuild/core` when scaffolding a TanStack Start project

A recent release of `@tanstack/create-start` relies on `@rsbuild/core` but only declares it as an optional peer dependency, so newly generated TanStack Start projects fail out of the box. C3 now installs `@rsbuild/core` as a dev dependency immediately after the framework generator completes, restoring the template. This also re-enables the TanStack Start entries in the C3 framework E2E test matrix, which had been quarantined while the upstream breakage was investigated.
