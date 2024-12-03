---
"wrangler": minor
---

feat: Make DX improvements in `wrangler dev --remote`

Workers + Assets projects have, in certain situations, a relatively degraded `wrangler dev --remote` developer experience, as opposed to Workers proper projects. This is due to the fact that, for Workers + Assets, we need to make extra API calls to:

1. check for asset files changes
2. upload the changed assets, if any

This commit improves the `wrangler dev --remote` DX for Workers + Assets, for use cases when the User Worker/assets change while the API calls for previous changes are still in flight. For such use cases, we have put an exit early strategy in place, that drops the event handler execution of the previous changes, in favour of the handler triggered by the new changes.
