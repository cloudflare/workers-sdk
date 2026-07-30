---
"wrangler": patch
---

Stop `wrangler dev` doing watcher-triggered work after it has shut down or reloaded its config

File watchers can deliver events while they are closing, and `wrangler dev` tears its controllers down concurrently, so work could still be started after dev had already moved on:

- a custom build could spawn the user's build command against a torn-down environment
- an assets change could report a bundle against a configuration that a config reload had just replaced
- a config update arriving after teardown created file watchers, an esbuild watch build and a temp directory that nothing was left to clean up, any of which could keep the process alive after dev had stopped

These paths now discard pending work, and no longer leave timers or watchers behind that can delay the process exiting.
