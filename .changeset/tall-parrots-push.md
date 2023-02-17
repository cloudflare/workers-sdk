---
"wrangler": minor
---

feature: able to deploy complex worker with static assets to Workers for Platforms

While simple workers could be uploaded via Cloudflare's API, complex workers, like Remix based, cannot be uploaded. With this feature you are able to specify platformNamespace. It will upload your static assets to KV store and the actual worker to the specified namespace.
