---
"wrangler": patch
---

Show an actionable error message when publishing to a workers.dev subdomain that hasn't been created yet.

When publishing a worker to workers.dev, you need to first have registered your workers.dev subdomain
(e.g. my-subdomain.workers.dev). We now check to ensure that the user has created their subdomain before
uploading a worker to workers.dev, and if they haven't, we provide a link to where they can go through
the workers onboarding flow and create one.
