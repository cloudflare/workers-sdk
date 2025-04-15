---
"wrangler": patch
---

fix redirected config env validation breaking wrangler pages commands

a validation check has recently been introduced to make wrangler error on
deploy commands when an environment is specified and a redirected configuration
is in use (the reason being that redirected configurations should not include
any environment), this check is problematic with pages commands where the
"production" environment is anyways set by default, to address this the validation
check is being relaxed here on pages commands
