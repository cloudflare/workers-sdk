---
"wrangler": patch
---

Fix `jsx_fragment` being ignored when `wrangler dev` runs a custom build

If your project uses a custom build and sets both `jsx_factory` and `jsx_fragment`, `wrangler dev` used your `jsx_factory` value for JSX fragments as well, so fragments compiled incorrectly. Your `jsx_fragment` value is now used.
