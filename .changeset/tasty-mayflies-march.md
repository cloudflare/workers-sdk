---
"wrangler": patch
---

fix: move the Windows C++ redistributable warning so it is only shown if there is an actual access violation

Replaces #6471, which was too verbose.

Fixes #6170
