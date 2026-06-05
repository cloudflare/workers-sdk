---
"create-cloudflare": patch
---

Fix `create cloudflare` aborting with `ERR_PNPM_IGNORED_BUILDS` on pnpm 11

pnpm 11 flipped `strictDepBuilds` to `true` by default, which makes the install fail when dependencies have unapproved build scripts. `wrangler` depends on `workerd` and `esbuild`, and (via miniflare) on `sharp` — all three need their postinstall scripts to produce platform binaries. Without pre-approval, `pnpm create cloudflare` aborted on pnpm 11 with a red `ERR_PNPM_IGNORED_BUILDS` error before the scaffold was usable.

The scaffold step now writes (or minimally merges into) a `pnpm-workspace.yaml` in the generated project that approves exactly those three packages. C3 deliberately does _not_ pre-approve build scripts for packages introduced by framework generators (such as `@parcel/watcher`, `@swc/core`, `lmdb`, etc.) — those are the generator's or the user's responsibility.

When pnpm still aborts the install with `ERR_PNPM_IGNORED_BUILDS` (because a framework generator pulled in unapproved build scripts), C3 now:

- parses the flagged package list out of the pnpm output instead of dumping the entire transcript,
- in an interactive shell, asks before running `pnpm approve-builds <pkg>…` and retrying the install once, and
- in a non-interactive shell (or after a declined prompt or unsuccessful retry), prints a concise summary with the exact `pnpm approve-builds` command to run in the generated project.
