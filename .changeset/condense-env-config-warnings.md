---
"wrangler": patch
---

Condense repeated environment configuration warnings

Wrangler now summarises repeated missing `vars` and `define` entries in environment configuration warnings. Experimental `unsafe` warnings are also only emitted once when the field appears at both the top level and in the active environment.
