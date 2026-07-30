---
"wrangler": patch
---

Stop `wrangler dev` doing watcher-triggered work after it has shut down or reloaded its config

File watchers can deliver events while they are closing, so `wrangler dev` could run a custom build, or report a bundle for an assets change, after dev had already stopped — spawning the user's build command against a torn-down environment — or against a configuration that had just been replaced by a config reload.

Both watcher paths now discard pending work once dev is tearing down or the config has been replaced, and no longer leave a timer behind that can delay the process exiting.
