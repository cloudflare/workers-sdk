---
"wrangler": patch
---

Close a compound SQL statement when its `END` is lowercase

`splitSqlQuery()` matched the opening `BEGIN`/`CASE` of a compound statement case insensitively but matched the closing `END` case sensitively. SQLite accepts either case, so a trigger written with a lowercase `end` never closed, and every statement after it was swallowed into the trigger body rather than being split out and executed.

```sql
CREATE TRIGGER IF NOT EXISTS update_trigger AFTER UPDATE ON items
begin
	DELETE FROM updates WHERE item_id=old.id;
end;
CREATE TABLE after_the_trigger (id TEXT PRIMARY KEY);
```

This produced two statements where the trailing `CREATE TABLE` was folded into the first. The existing tests already covered a lowercase `begin`, but always paired it with an uppercase `END`, so the asymmetry went unnoticed.
