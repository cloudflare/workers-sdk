---
"wrangler": patch
---

Improve D1 error messages for missing or conflicting options

Error messages for `d1 execute`, `d1 export`, `d1 time-travel restore`, and `d1 insights` now clearly state which option is missing or conflicting, explain why the combination is invalid, and suggest how to fix the issue.

Additionally, duration validation errors in `d1 insights` are now thrown as `UserError` instead of plain `Error`, ensuring they are displayed cleanly to users rather than as unexpected crashes.
