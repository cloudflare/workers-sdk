---
"miniflare": minor
---

Support Browser Run quick actions in local development

`env.BROWSER.quickAction(action, options)` now works with a local browser binding instead of failing with `The RPC receiver does not implement the method "quickAction"`. The `screenshot`, `pdf`, `content`, `markdown`, `snapshot`, `scrape`, `links` and `accessibilityTree` actions run in a local Chrome and return the same responses and errors as Browser Run.

Workers AI isn't available locally, so the `json` action returns placeholder data shaped like `response_format.json_schema` and logs a warning. The `kitesurf` browser isn't supported locally either. Set `"remote": true` on the browser binding to use Browser Run for these.
