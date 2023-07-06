---
"wrangler": minor
---

Prefer non-force deletes unless a Worker is a dependency of another.

If a Worker is used as a service binding, a durable object namespace, an outbounds for a dynamic dispatch namespace, or a tail consumer, then deleting that Worker will break those existing ones that depend upon it. Deleting with ?force=true allows you to delete anyway, which is currently the default in Wrangler.

Force deletes are not often necessary, however, and using it as the default has unfortunate consequences in the API. To avoid them, we check if any of those conditions exist, and present the information to the user. If they explicitly acknowledge they're ok with breaking their other Workers, fine, we let them do it. Otherwise, we'll always use the much safer non-force deletes. We also add a "--force" flag to the delete command to skip the checks and confirmation and proceed with ?force=true
