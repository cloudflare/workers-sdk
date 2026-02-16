---
"wrangler": minor
---

Ensure the `nodejs_compat` flag is always applied in autoconfig

Previously, the autoconfig feature relied on individual framework configurations to specify Node.js compatibility flags, some could set `nodejs_compat` while others `nodejs_als`.

Now instead `nodejs_compat` is always included as a compatibility flag, this is generally beneficial and the user can always remove the flag afterwards if they want to.
