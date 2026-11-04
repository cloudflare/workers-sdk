---
"miniflare": patch
---

Skip D1 comment-only statements that start at offset 0

Local D1 skipped a comment-only statement only when whitespace came before the `--`. A statement such as `-- comment` at offset 0 failed with "SQL code did not contain a statement." Local D1 now skips these statements, as remote D1 does.
