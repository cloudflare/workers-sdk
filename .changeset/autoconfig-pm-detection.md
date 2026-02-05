---
"wrangler": patch
---

fix: use project's package manager in `wrangler setup`

`wrangler setup` now correctly detects and uses the project's package manager based on lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `package-lock.json`) and the `packageManager` field in `package.json`. Previously, it would fall back to npm when run directly from the terminal, causing failures in pnpm and yarn workspace projects due to the `workspace:` protocol not being supported by npm.

This change leverages the package manager detection already performed by `@netlify/build-info` during framework detection, ensuring consistent behaviour across the autoconfig process.
