---
"wrangler": patch
---

Stop reporting breadcrumbs to sentry

Sentry's SDK automatically tracks "breadcrumbs", which are pieces of information
that get tracked leading up to an exception. This can be useful for debugging
errors because it gives better insight into what happens before an error occurs,
so you can more easily understand and recreate exactly what happened before an
error occurred.

Unfortunately, Sentry automatically includes all `console` statements. And since
we use the console a lot (e.g. logging every request received in `wrangler dev`),
this is mostly useless. Additionally, since developers frequently use the console
to debug their workers we end up with a bunch of data that is not only irrelevant
to the reported error, but also contains data that could be potentially sensitive.

For now, we're turning off breadcrumbs entirely. Later, we might wish to add our
own breadcrumbs manually (e.g. add a "wrangler dev" breadcrumb when a user runs
`wrangler dev`), at which point we can selectively enable breadcrumbs to catch
only the ones we've put in there ourselves.
