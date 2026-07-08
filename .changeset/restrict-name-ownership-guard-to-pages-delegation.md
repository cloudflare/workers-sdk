---
"wrangler": patch
---

Fix `wrangler deploy` aborting in CI for autoconfigured projects

A recent change guarded non-interactive deploys against overwriting a same-named Worker whenever there was no config file naming it. This was too broad: a plain `wrangler deploy` run in CI without a config file (for example an autoconfigured project whose generated config PR has not been merged) would fail with "A Worker named ... already exists in your account", even though re-deploying to that Worker is the intended behaviour.

The guard is now limited to the Pages-to-Workers delegation, where the target name is a Pages project name that must not clobber an unrelated Worker. Plain deploys once again deploy normally.
