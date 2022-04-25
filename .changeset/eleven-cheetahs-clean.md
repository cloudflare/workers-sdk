---
"wrangler": patch
---

fix: make wrangler work on node v18

There's some interference between our data fetching library `undici` and node 18's new `fetch` and co. (powered by `undici` internally) which replaces the filename of `File`s attached to `FormData`s with a generic `blob` (likely this code - https://github.com/nodejs/undici/blob/615f6170f4bd39630224c038d1ea5bf505d292af/lib/fetch/formdata.js#L246-L250). It's still not clear why it does so, and it's hard to make an isolated example of this.

Regardless, disabling the new `fetch` functionality makes `undici` use its own base classes, avoiding the problem for now, and unblocking our release. We'll keep investigating and look for a proper fix.

Unblocks https://github.com/cloudflare/wrangler2/issues/834
