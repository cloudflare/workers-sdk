---
"wrangler": patch
---

Fix `wrangler versions secret put/delete/bulk` to preserve the existing version's placement settings

When creating a new version via `wrangler versions secret`, the previous code only re-emitted a bare `{ mode: "smart" }` placement when the API reported `placement_mode === "smart"`, dropping any other placement entirely. The new version is now created with the placement settings returned by the API, so placement settings survive a secret put/delete/bulk round-trip.
