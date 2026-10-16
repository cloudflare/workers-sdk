---
"miniflare": patch
---

Fix requests failing with `ECONNRESET` after a Worker responds without reading a streamed request body

Update workerd to `1.20261014.1`, which fixes connection handling when an unread request body crosses a service binding. This preserves keep-alive connection reuse without retrying requests that may already have run. Align the default compatibility date with the updated runtime.
