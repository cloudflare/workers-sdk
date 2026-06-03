---
"create-cloudflare": patch
---

Write `pnpm-workspace.yaml` before `pnpm install` to prevent `ERR_PNPM_IGNORED_BUILDS`

pnpm 9+ blocks build scripts for packages like `esbuild`, `workerd`, and `sharp` by default
unless they are explicitly allowed in `pnpm-workspace.yaml`. `create-cloudflare` now writes
this file before running `pnpm install`, using `onlyBuiltDependencies` for pnpm 9.x and
`allowBuilds` for pnpm 10+.
