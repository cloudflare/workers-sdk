---
"wrangler": minor
---

chore: move `wrangler versions ...`, `wrangler deployments ...`, `wrangler rollback` and `wrangler triggers ...` out of experimental and open beta.
These are now available to use without the --x-versions flag, you can continue to pass this however without issue to keep compatibility with all the usage today.

A few of the commands had an output that wasn't guarded by `--x-versions` those have been updated to use the newer output, we have tried to keep compatibility where possible (for example: `wrangler rollback` will continue to output "Worker Version ID:" so users can continue to grab the ID).
If you wish to use the old versions of the commands you can pass the `--no-x-versions` flag. Note, these will be removed in the future so please work on migrating.
