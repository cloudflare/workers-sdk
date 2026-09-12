---
"wrangler": patch
---

Treat bracket-quoted identifiers as quoted when splitting D1 SQL files

The D1 SQL splitter handled `'`, `"` and backtick quoting but not SQLite's bracket-quoted identifiers (`[name]`), while `normalizeSqlLineEndings()` in the same file already did. A `;` inside such an identifier, e.g. `CREATE TABLE metrics ([value;unit] TEXT);`, was treated as a statement boundary, so `wrangler d1 execute --file` and `wrangler d1 migrations apply` sent broken fragments to D1. The scanner now skips over `[` … `]` like the other quote styles, which also keeps the new punctuation-delimited compound markers from matching keywords inside brackets, such as a `[end]` column in a trigger body.
