---
"wrangler": patch
---

fix: pages "command" can consist of multiple words

On Windows, the following command `wrangler pages dev -- foo bar` would error
saying that `bar` was not a known argument. This is because `foo` and `bar` are
passed to Yargs as separate arguments.

A workaround is to put the command in quotes: `wrangler pages dev -- "foo bar"`.
But this fix makes the `command` argument variadic, which also solves the problem.

Fixes [#965](https://github.com/cloudflare/wrangler2/issues/965)
