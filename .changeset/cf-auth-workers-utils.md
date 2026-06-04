---
"@cloudflare/workers-utils": minor
---

Parameterize `getGlobalWranglerConfigPath` by app name, and fix the ESM `require` shim at the source

`getGlobalWranglerConfigPath(appName = "wrangler", useLegacyHomeDir = true)` now accepts an application namespace so other first-party CLIs can resolve their own XDG-compliant global config directory. Existing callers are unaffected (the default remains `.wrangler` with the legacy `~/.wrangler` fallback). Pass `useLegacyHomeDir: false` to always use the XDG path.

The Node build now injects a `createRequire`-backed `globalThis.require` via a tsup banner so the bundled CJS dependencies (e.g. `xdg-app-paths`) resolve under pure ESM. This bakes in the fix that downstream consumers previously had to apply via a pnpm patch. The browser build is intentionally excluded.
