---
"wrangler": patch
---

Display a more helpful error when trying to publish to a route in use by another worker.

Previously, when trying to publish a worker to a route that was in use by another worker,
there would be a really unhelpful message about a failed API call. Now, there's a much
nicer message that tells you what worker is running on that route, and gives you a link
to the workers overview page so you can unassign it if you want.

```text
 ⛅️ wrangler 2.1.11
--------------------
Total Upload: 0.20 KiB / gzip: 0.17 KiB

✘ [ERROR] Can't publish a worker to routes that are assigned to another worker.

  "test-custom-routes-redeploy" is already assigned to route
  test-custom-worker.swag.lgbt

  Unassign other workers from the routes you want to publish to, and then try again.
  Visit
  https://dash.cloudflare.com/8046ced7e2c70129d1732280998af108/workers/overview
  to unassign a worker from a route.
```

Closes #1849
