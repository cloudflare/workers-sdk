---
"wrangler": patch
---

Relax the messaging when Wrangler uses redirected configuration

Previously the messaging was rendered as a warning, which implied that the user
had done something wrong. Now it is just a regular info message.
