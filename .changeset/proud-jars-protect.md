---
"wrangler": patch
---

refactor: delegate deprecated `preview` command to `dev` if possible

The `preview` command is deprecated and not supported in this version of Wrangler.
Instead, one should use the `dev` command for most `preview` use-cases.

This change attempts to delegate any use of `preview` to `dev` failing if the command line contains positional arguments that are not compatible with `dev`.

Resolves #9
