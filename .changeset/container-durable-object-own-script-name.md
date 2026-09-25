---
"wrangler": patch
---

Accept a Container on a Durable Object whose binding's `script_name` names the current Worker

Wrangler rejected any Container whose Durable Object binding had a `script_name`, reporting that the class was defined in another Worker, even when `script_name` named the current Worker. `wrangler dev` and `wrangler deploy` now treat that binding as local, as they already do elsewhere.
