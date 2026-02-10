---
"wrangler": patch
---

fix: use unscoped binary name for OpenNext autoconfig command overrides

The build, deploy, and version command overrides in the Next.js (OpenNext) autoconfig handler used the scoped package name `@opennextjs/cloudflare`, which pnpm interprets as a workspace filter rather than a binary name. This caused `wrangler deploy --x-autoconfig` to fail for pnpm-based Next.js projects with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`. Changed to use the unscoped binary name `opennextjs-cloudflare`, which resolves correctly across all package managers.
