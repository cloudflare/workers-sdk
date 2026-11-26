---
"wrangler": patch
---

Stop `wrangler auth token` from printing the Wrangler banner when its output isn't going to a terminal

Previously, capturing the token in a script, such as `TOKEN=$(wrangler auth token)`, also captured the Wrangler banner, so the variable held decorative output as well as the token. The banner is now only shown when the command runs interactively, so non-interactive and CI usage gets just the token. Interactive output and `--json` output are unchanged.
