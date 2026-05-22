---
"wrangler": patch
---

report all failing triggers from a single deploy

`wrangler deploy` deploys several kinds of trigger in parallel (routes, custom domains, schedules, queue producers/consumers, workflows). Previously, if one of those API calls failed, the first rejection short-circuited the rest, no other deployments were reported, and (in the case of custom-domain confirmation conflicts) some failures were silently logged to stdout without the deploy actually failing.

`wrangler deploy` now waits for every trigger deployment to settle, prints every successfully-deployed target (so you still see what landed), and then throws a single error listing every trigger that failed.

Note that this also turns the previously-silent "user declined to override a conflicting Custom Domain" case into a hard failure of `wrangler deploy`, which matches what was always implied by the message ("Publishing to Custom Domain ... was skipped, fix conflict and try again").
