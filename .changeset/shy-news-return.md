---
"wrangler": patch
---

fix: do not hang waiting for account choice when in non-interactive mode

The previous tests for non-interactive only checked the stdin.isTTY, but
you can have scenarios where the stdin is interactive but the stdout is not.
For example when writing the output of a `kv:key get` command to a file.

We now check that both stdin and stdout are interactive before trying to
interact with the user.
