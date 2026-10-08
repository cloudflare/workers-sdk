---
"wrangler": patch
---

Fix `wrangler types --check` reporting a hand-edited Env as up to date

`wrangler types --check` compared only the hash stored in the generated header, so an edit to the Env interface that left that line alone still exited 0. The check now also requires the Env body on disk to match the Env types Wrangler would write. Runtime types stay on the header check, because a matching runtime header is reused from the file.
