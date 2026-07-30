---
"wrangler": patch
---

Stop `wrangler dev` starting new work after you stop it or it reloads

Stopping `wrangler dev`, or having it reload after a configuration change, could still leave it starting work for the state it had just left behind: your custom build command could run once more after dev had stopped, a change to a file in your assets directory could be reported against configuration that had already been replaced, and in some cases the process could stay alive instead of exiting.

That work is now discarded, so stopping or reloading `wrangler dev` leaves nothing running behind it.
