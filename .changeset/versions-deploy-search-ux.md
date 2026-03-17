---
"wrangler": minor
---

Add type-to-search filtering to `wrangler versions deploy` interactive prompt

The version selection prompt in `wrangler versions deploy` was difficult to use when many versions existed — the list could be 20+ items long, each with multi-line details, making it hard to navigate and select. The prompt now supports type-to-search filtering: you can type part of a version ID, tag, message, or creation date to instantly narrow the list. The viewport also now shows 3 versions at a time with scrolling instead of dumping the entire list at once.
