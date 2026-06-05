---
"create-cloudflare": patch
---

Fix `create cloudflare` aborting with `ERR_PNPM_IGNORED_BUILDS` on pnpm 11

pnpm 11 flipped `strictDepBuilds` to `true` by default, which makes the install fail when dependencies have unapproved build scripts. `wrangler` depends on `workerd` and `esbuild`, and (via miniflare) on `sharp` — all three need their postinstall scripts to produce platform binaries. Without pre-approval, `pnpm create cloudflare` aborted on pnpm 11 with a red `ERR_PNPM_IGNORED_BUILDS` error before the scaffold was usable.

The scaffold step now writes (or minimally merges into) a `pnpm-workspace.yaml` in the generated project that approves exactly those three packages. C3 deliberately does _not_ approve build scripts for packages introduced by framework generators (such as `@parcel/watcher`, `@swc/core`, `lmdb`, etc.) — those are the generator's or the user's responsibility, and the user can approve them via `pnpm approve-builds` in the generated project.

If an install still fails with `ERR_PNPM_IGNORED_BUILDS` (because a framework generator pulled in unapproved build scripts), C3 now prints actionable guidance pointing at `pnpm approve-builds` alongside the raw pnpm output.
