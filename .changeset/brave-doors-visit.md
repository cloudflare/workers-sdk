---
"wrangler": patch
---

fix: rollback in the case of a secret change, the prompt meant to show was not showing due to the spinner in an interactive env. It will now properly show.

chore: improve the view of `wrangler versions view` and change up copy a little for `versions secret` commands.
