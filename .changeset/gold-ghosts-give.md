---
"wrangler": patch
---

Offer to create a workers.dev subdomain if a user needs one

Previously, when a user wanted to publish a worker to https://workers.dev by setting `workers_dev = true` in their `wrangler.toml`,
but their account didn't have a subdomain registered, we would error out.

Now, we offer to create one for them. It's not implemented for `wrangler dev`, which also expects you to have registered a
workers.dev subdomain, but we now error correctly and tell them what the problem is.
