---
"@cloudflare/autoconfig": patch
---

Fix Vite version detection for vite+ projects during autoconfiguration

vite+ installs `@voidzero-dev/vite-plus-core` under the `vite` npm alias, so the resolved `node_modules/vite/package.json` reports the wrapper's own version (e.g. `0.2.2`) rather than the underlying Vite version it bundles. This caused autoconfiguration to fail with an error claiming the Vite version was too old to be configured automatically. Autoconfiguration now detects the correct underlying Vite version for these projects.
