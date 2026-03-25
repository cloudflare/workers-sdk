---
"@cloudflare/workers-utils": minor
---

Export new utilities for command execution, package manager detection, and package installation

`@cloudflare/workers-utils` now exports four new modules:

- `command-helpers`: `runCommand` and `quoteShellArgs` for executing shell commands with optional spinner progress and output capture.
- `package-managers`: `getPackageManager`, `sniffUserAgent`, and package manager constants (`NpmPackageManager`, `PnpmPackageManager`, `YarnPackageManager`, `BunPackageManager`) for detecting and working with npm, pnpm, yarn, and bun.
- `packages`: `installPackages` and `installWrangler` for installing dependencies via the detected package manager. For bun, `installPackages` uses `bun add -d` (matching the original C3 behavior) rather than `bun install --save-dev`.
- `codemod`: `parseJs`, `parseTs`, `parseFile`, `transformFile`, and `mergeObjectProperties` for parsing and transforming JavaScript/TypeScript source files.
