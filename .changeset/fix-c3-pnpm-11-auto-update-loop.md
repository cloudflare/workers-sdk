---
"create-cloudflare": patch
---

Fix infinite loop when running C3 with pnpm 11

When invoked via `pnpm create cloudflare@latest`, C3 checks npm for a newer version and re-launches itself with the latest version if one is available. pnpm 11 enables the `minimumReleaseAge` supply-chain protection by default, so `pnpm create cloudflare@latest` will not resolve a version published in the last 24 hours. When the npm `latest` tag points at a version newer than what pnpm is willing to install, the update check stayed true and C3 re-launched itself forever.

The relaunched process is now marked so it never re-runs the auto-update check, ensuring C3 starts up after at most one relaunch regardless of the package manager's version resolution.
