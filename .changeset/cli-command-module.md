---
"@cloudflare/cli": minor
---

Add `runCommand` and `quoteShellArgs`, `installPackages` and `installWrangler` utilities to `@cloudflare/cli/command`

These utilities are now available from `@cloudflare/cli` as dedicated sub-path exports: `runCommand` and `quoteShellArgs` via `@cloudflare/cli/command`, and `installPackages` and `installWrangler` via `@cloudflare/cli/packages`. This makes them reusable across packages in the SDK without duplication.
