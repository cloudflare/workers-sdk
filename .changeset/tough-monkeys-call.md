---
"wrangler": patch
---

fix: remove extra arguments from wrangler init deprecation message and update recommended c3 version

c3 can now infer the pre-existing type from the presence of the `--existing-script` flag so we can remove the extra `type` argument. C3 2.5.0 introduces an auto-update feature that will make sure users get the latest minor version of c3 and prevent problems where older 2.x.x versions get cached by previous runs of `wrangler init`.
