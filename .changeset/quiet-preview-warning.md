---
"wrangler": patch
---

Warn when `wrangler versions upload` gets no preview URL while `preview_urls` is enabled

Until now `wrangler versions upload` printed nothing when a version came back without a preview URL, so a Worker with `preview_urls: true` looked like it had previews turned on when it didn't. It now warns in the two cases it can tell apart. Workers that implement a Durable Object, including Containers and Sandboxes, never get Version URLs, and the warning links that documented limitation. When the Worker has Preview URLs disabled, the warning says to run `wrangler triggers deploy` or `wrangler deploy`, since `versions upload` doesn't apply the `preview_urls` setting.
