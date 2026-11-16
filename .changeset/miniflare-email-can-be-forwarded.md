---
"miniflare": patch
---

Expose `canBeForwarded` boolean property on `ForwardableEmailMessage` in email handler

Previously, in `wrangler dev`, the `ForwardableEmailMessage` passed to a Worker's `email()` handler did not expose the documented `canBeForwarded` property, causing it to read as `undefined` locally while production exposes it as a read-only boolean. `canBeForwarded: true` is now set on the incoming message object in Miniflare, matching production behavior.
