---
"wrangler": patch
---

chore: Remove acorn/acorn-walk dependency used in Pages Functions filepath-routing.

This shouldn't cause any functional changes, Pages Functions filepath-routing now uses esbuild to find exports.
