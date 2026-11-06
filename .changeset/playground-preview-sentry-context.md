---
"@cloudflare/playground-preview-worker": patch
---

Report preview failures to Sentry with enough context to find their cause

Runtime internal errors raised while forwarding a request to a user's preview had no stack, tags or release, and their random reference made every event a new Sentry issue and a new alert. They are now grouped into one issue for each part of the preview worker, with each runtime reference kept as a searchable tag.

Events now record which part of the preview worker reported them, the preview host, a hash of the session ID, the deployed version, and breadcrumbs for the session state, the preview's age and the outcome of the request to the preview Worker. The session ID is hashed because it also authorises preview requests.
