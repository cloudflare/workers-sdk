---
"wrangler": patch
---

fix: Ensure generateConfigFromFileTree generates config correctly for multiple splats

Functions with multiple parameters, like /near/[latitude]/[longitude].ts wouldn't work. This
fixes that.
