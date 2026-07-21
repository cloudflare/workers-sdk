---
"wrangler": patch
---

Improve the "Did you mean …?" suggestion for mistyped commands on ties

When a mistyped command is an equal edit-distance from more than one valid command, Wrangler now suggests the first closest match in order rather than the last, giving a more predictable and sensible "Did you mean …?" hint.
