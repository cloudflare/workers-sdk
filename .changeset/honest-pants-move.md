---
"wrangler": patch
---

fix: Fixes Pages Plugins and static asset routing.

There was previously a bug where a relative pathname would be missing the leading slash which would result in routing errors.
