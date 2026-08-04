---
"wrangler": minor
---

Find container instances by exact ID or name

`wrangler containers instances <application_id> --search <instance_id_or_name>` now searches every page and returns exact matches in human-readable or JSON output. JSON returns a top-level array, including an empty array when there is no match, while human-readable output prints a no-match message. If multiple instances have the same exact name, every matching instance is returned.
