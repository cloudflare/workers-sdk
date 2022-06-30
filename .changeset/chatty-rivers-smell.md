---
"wrangler": patch
---

chore: fully deprecate the `preview` command

Before, we would warn folks that `preview` was deprecated in favour of `dev`, but then ran `dev` on their behalf.
To avoid maintaining effectively two versions of the `dev` command, we're now just telling folks to run `dev`.
