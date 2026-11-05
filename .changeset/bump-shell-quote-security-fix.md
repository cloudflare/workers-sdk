---
"wrangler": patch
---

Bump bundled `shell-quote` from 1.10.0 to 1.11.0 to pick up a security fix

`shell-quote` is bundled into Wrangler, which uses it to parse and quote shell commands such as custom build and Pages dev commands. Version 1.10.0 is affected by a published advisory, and 1.11.0 includes the fix. Command parsing does not change.
