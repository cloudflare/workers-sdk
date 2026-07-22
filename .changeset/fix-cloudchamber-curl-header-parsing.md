---
"wrangler": patch
---

Fix `wrangler cloudchamber curl` mangling header values that contain a colon

Header values were split on every colon and only the segment between the first and second was sent, so `--header location:https://example.com/x` arrived as `https`. Passing a header with no colon at all threw a `TypeError`. Headers are now split on the first colon only, and a header given without a value is sent with an empty one.
