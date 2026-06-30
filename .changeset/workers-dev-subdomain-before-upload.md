---
"wrangler": patch
---

Register a workers.dev subdomain before uploading a new Worker

Deploying a Worker for the first time on an account that has no workers.dev subdomain failed with an opaque API error raised by the upload request itself (code 10063, "You need a workers.dev subdomain in order to proceed"). Wrangler now checks for a workers.dev subdomain before uploading a brand-new Worker and prompts you to register one, so you get a clear, actionable message instead of a cryptic API failure. Existing Workers are unaffected, since their account already has a subdomain.
