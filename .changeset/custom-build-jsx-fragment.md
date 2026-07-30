---
"wrangler": patch
---

Fix `jsx_fragment` being ignored when `wrangler dev` runs a custom build

The custom build path in `wrangler dev` passed the configured `jsx_factory` to esbuild as the JSX fragment factory, so projects that set both options got the wrong fragment pragma and their JSX fragments compiled incorrectly. The configured `jsx_fragment` value is now used.
