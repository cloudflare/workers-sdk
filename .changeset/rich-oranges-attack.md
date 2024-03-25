---
"wrangler": minor
---

fix: Use queue name, not ID, for `r2 bucket event-notification` subcommands

Since the original command was not yet operational, this update does not constitute a breaking change.

Instead of providing the queue ID as the parameter to `--queue`, users must provide the queue _name_. Under the hood, we will query the Queues API for the queue ID given the queue name.
