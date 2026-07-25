---
"wrangler": patch
---

Fix `wrangler cloudchamber curl` mangling header values that contain a colon

Header values were split on every colon and only the segment between the first and second was sent, so `--header location:https://example.com/x` arrived as `https`. Headers are now split on the first colon only. A header that is not in the documented `--header <name>:<value>` form previously threw an unhandled `TypeError`, and now reports a clear error.
