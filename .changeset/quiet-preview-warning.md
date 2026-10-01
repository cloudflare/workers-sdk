---
"wrangler": patch
---

Warn when `wrangler versions upload` gets no preview URL while `preview_urls` is enabled

Workers that implement a Durable Object, including Containers and Sandboxes, never get Version URLs. Until now `wrangler versions upload` printed nothing in that case, so a Worker with `preview_urls: true` looked like it had previews turned on when every version came back without one. It now prints a warning that links to the documented limitation.
