---
"wrangler": patch
---

fix: include version components in command event metrics

Adds `wranglerMajorVersion`, `wranglerMinorVersion`, and `wranglerPatchVersion` to command events (`wrangler command started`, `wrangler command completed`, `wrangler command errored`). These properties were previously only included in adhoc events.
