---
"wrangler": patch
---

Fix local D1 migrations containing `CASE` expressions in triggers

Wrangler now keeps complete SQLite trigger bodies together without interpreting `CASE` expression boundaries. This prevents local migrations from failing when `CASE ... END` is followed by punctuation, while preserving unquoted columns named `begin` or `end`.
