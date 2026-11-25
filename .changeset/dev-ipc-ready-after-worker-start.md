---
"wrangler": patch
---

Wait for the Worker to start before `wrangler dev` tells a parent process that it is ready

Requests sent right after that signal could otherwise wait for the Worker to start, and time out on slow machines.
