---
"wrangler": patch
---

fix: report all failing triggers from a single deploy

`wrangler deploy` deploys several kinds of trigger in parallel (routes, custom domains, schedules, queue producers/consumers, workflows). Previously, if one of those API calls failed, the first rejection short-circuited the rest, no other deployments were reported, and (in the case of custom-domain confirmation conflicts) some failures were silently logged to stdout without the deploy actually failing.

`wrangler deploy` now waits for every trigger deployment to settle, prints every successfully-deployed target (so you still see what landed), and then throws a single `UserError` listing every trigger that failed. The aggregated error preserves the underlying errors via `AggregateError` as its `cause`, and combines the inner `telemetryMessage` labels into a stable, low-cardinality aggregate label so failures continue to group meaningfully in telemetry.

Note that this also turns the previously-silent "user declined to override a conflicting Custom Domain" case into a hard failure of `wrangler deploy`, which matches what was always implied by the message ("Publishing to Custom Domain ... was skipped, fix conflict and try again").
