---
"wrangler": patch
---

Skip lock file warning for static projects during autoconfig

Previously, running autoconfig on a static project (one with no framework detected) would emit a misleading warning about a missing lock file, suggesting the project might be in a workspace. Since static projects don't require a lock file, this warning is now suppressed for them.
