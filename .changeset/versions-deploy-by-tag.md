---
"wrangler": minor
---

Add `--version-tag` support to `wrangler versions deploy` to deploy a version by its tag

You can now roll out or roll back a version by the tag it was uploaded with (e.g. a commit SHA passed to `--tag` at upload time) instead of first looking up its Version ID:

`wrangler versions deploy --version-tag <sha>@100%`

The tag is resolved to a Version ID against the worker's deployable versions, and the `<version-tag>@<percentage>` shorthand works just like the existing `<version-id>@<percentage>` notation, including splitting traffic across multiple `--version-tag` values. If a tag matches no deployable version, or matches more than one, the command errors and asks you to deploy by Version ID directly. Note that tags can only be resolved against recent (deployable) versions — older versions that have aged out of that window must still be deployed by Version ID.
