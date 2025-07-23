---
"wrangler": patch
---

make sure that the ready-on message is printed after the appropriate runtime controller is ready

fix the fact that when starting a local (or remote) dev session the log saying `Ready on http://localhost:xxxx` could be displayed before the runtime is actually ready to handle requests (this is quite noticeable when locally running dev sessions with containers, where the ready message currently gets displayed before the container images building/pulling process)
