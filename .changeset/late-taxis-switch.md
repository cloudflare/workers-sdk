---
"wrangler": patch
---

add support for containers in wrangler multiworker dev

currently when running `wrangler dev` with different workers (meaning that the `-c|--config` flag is used multiple times) containers are not being included, meaning that trying to interact with them at runtime would not work and cause errors instead. The changes here address the above making wrangler correctly detect and wire up the containers.
