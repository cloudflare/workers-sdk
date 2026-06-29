---
"wrangler": patch
---

Fix drawBox crash on empty content array

Previously, `drawBox([])` would crash with `RangeError: Invalid count value: -Infinity` because `Math.max()` on an empty array returns `-Infinity`, which caused `String.prototype.repeat()` to throw.
