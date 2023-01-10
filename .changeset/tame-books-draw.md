---
"wrangler": patch
---

fix: unstable_dev() experimental options incorrectly applying defaults

A subtle difference when removing object-spreading of experimental unstable_dev() options caused `wrangler pages dev` interactivity to stop working. This switches back to object-spreading the passed in options on top of the defaults, fixing the issue.
