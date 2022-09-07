---
"wrangler": patch
---

fix: refactor unstable_dev to avoid race conditions with ports

Prior to this change, wrangler would check to see if a port was available, do a bit more work, then try use that port when starting miniflare. With this change, we're using port 0 to tell Node to assign us a random free port.

To make this change work, we had to do some plumbing so miniflare can tell us the host and port it's using, so we can call fetch against it.
