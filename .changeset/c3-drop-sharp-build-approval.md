---
"create-cloudflare": patch
---

Stop pre-approving `sharp`'s build script in generated projects

`miniflare` 0.35+ ships `sharp` 0.35, which no longer has an `install` lifecycle script, so generated `pnpm-workspace.yaml` files no longer pre-approve `sharp` under `allowBuilds`. `esbuild` and `workerd` are still pre-approved because they retain their install/`postinstall` scripts.
