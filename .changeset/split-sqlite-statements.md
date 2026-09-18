---
"wrangler": patch
---

Match D1 SQL statement splitting to the local SQLite runtime

Wrangler now uses SQLite's statement-completion state machine when splitting D1 SQL files. This keeps trigger, quoted identifier, comment, and keyword handling consistent with local execution.
