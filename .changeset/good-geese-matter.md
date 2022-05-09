---
"wrangler": patch
---

fix: bundle worker as iife if detected as a service worker

We detect whether a worker is a "modules" format worker by the presence of a `default` export. This is a pretty good heuristic overall, but sometimes folks can make mistakes. One situation that's popped up a few times, is people writing exports, but still writing it in "service worker" format. We detect this fine, and log a warning about the exports, but send it up with the exports included. Unfortunately, our runtime throws when we mark a worker as a service worker, but still has exports. This patch fixes it so that the exports are not included in a service-worker worker.

Note that if you're missing an event listener, it'll still error with "No event handlers were registered. This script does nothing." but that's a better error than the SyntaxError _even when the listener was there_.

Fixes https://github.com/cloudflare/wrangler2/issues/937
