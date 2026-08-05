---
"wrangler": patch
---

Fixes D1 SQL statements not handling lowercase `end`s correctly

`wrangler d1 execute` and `wrangler d1 migrations apply` split a SQL file into statements before running them. A `BEGIN` or `CASE` block closed with a lowercase `end` was not recognised as closed, so every statement after it was folded into that block instead of being run on its own. SQLite accepts either case, so a file like this applied only the trigger and silently skipped the table:

```sql
CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
begin
	DELETE FROM updates WHERE item_id=old.id;
end;
CREATE TABLE after_the_trigger (id TEXT PRIMARY KEY);
```

Files written with an uppercase `END` were unaffected. Both cases now behave the same.
