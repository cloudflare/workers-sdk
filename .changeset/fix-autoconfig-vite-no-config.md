---
"wrangler": patch
---

Fix `wrangler setup` failing for Vite projects without a config file

`wrangler setup` (and `wrangler deploy --experimental-autoconfig`) crashed with "Could not find Vite config file to modify" for Vite projects that don't have a `vite.config.js` or `vite.config.ts`. This affected 6 of the 16 `create-vite` templates: `vanilla`, `vanilla-ts`, `react-swc`, `react-swc-ts`, `lit`, and `lit-ts`.

Autoconfig now creates a minimal Vite config with the Cloudflare plugin when no config file exists, instead of failing. The file extension (`.ts` or `.js`) is chosen based on whether the project has a `tsconfig.json`.
