---
"create-cloudflare": patch
"@cloudflare/cli-shared-helpers": patch
---

Detect the `nub` package manager

C3 resolves the invoking package manager with `which-pm-runs`, which already returns `nub`, but `detectPackageManager` had no `nub` case in its switch, so it fell through to the npm default and produced npm commands. `detectPackageManager` now maps `nub` to its `nub`/`nubx` executables, and `@cloudflare/cli-shared-helpers`'s package-install helpers accept `nub` as a package manager.
