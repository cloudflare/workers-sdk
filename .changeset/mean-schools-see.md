---
"miniflare": patch
---

Fix D1 SQL dump generation: escape identifiers and handle SQLite's dynamic typing

Escape column and table names to prevent SQL syntax errors.
Escape values based on their runtime type to support SQLite's flexible typing.
