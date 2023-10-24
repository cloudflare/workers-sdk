---
"wrangler": minor
---

fix: suppress compatibility date fallback warnings if no `wrangler` update is available

If a compatibility date greater than the installed version of `workerd` was
configured, a warning would be logged. This warning was only actionable if a new
version of `wrangler` was available. The intent here was to warn if a user set
a new compatibility date, but forgot to update `wrangler` meaning changes
enabled by the new date wouldn't take effect. This change hides the warning if
no update is available.

It also changes the default compatibility date for `wrangler dev` sessions
without a configured compatibility date to the installed version of `workerd`.
This previously defaulted to the current date, which may have been unsupported
by the installed runtime.
