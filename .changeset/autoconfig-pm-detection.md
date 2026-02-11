---
"wrangler": patch
---

fix: use project's package manager in wranger autoconfig

`wrangler setup` now correctly detects and uses the project's package manager based on lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `package-lock.json`) and the `packageManager` field in `package.json`. Previously, it would fall back to the package manager used to execute the command when run directly from the terminal, causing failures in pnpm and yarn workspace projects if the wrong manager was used in this step due to the `workspace:` protocol not being supported by npm.

This change leverages the package manager detection already performed by `@netlify/build-info` during framework detection, ensuring consistent behaviour across the autoconfig process.
