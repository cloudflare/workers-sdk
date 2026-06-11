---
"create-cloudflare": patch
---

Fix `create cloudflare` aborting with `ERR_PNPM_IGNORED_BUILDS` on pnpm 11

pnpm 11 flipped `strictDepBuilds` to `true` by default, which makes the install fail when dependencies have unapproved build scripts. `wrangler` depends on `workerd` and `esbuild`, and (via miniflare) on `sharp` — all three need their postinstall scripts to produce platform binaries.

C3 now writes or merges in a `pnpm-workspace.yaml` in the generated project that approves exactly those three packages. If other packages trigger this error, C3 also now interactively offers to retry with `pnpm approve-builds <pkg>…`
