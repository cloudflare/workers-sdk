---
"wrangler": patch
---

Surface the original error message, name and stack when the dev server reports an internal error

Previously `wrangler dev` could exit with an empty `✘ [ERROR]` log that gave no indication of what went wrong (e.g. `Network connection lost.`, see #14641). These errors now include their original message, name and stack, so the failure is actually diagnosable.
