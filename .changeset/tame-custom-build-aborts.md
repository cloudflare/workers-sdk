---
"wrangler": patch
---

Abort in-flight custom builds when `wrangler dev` exits or restarts a build

Previously, `wrangler dev` marked in-flight custom builds as stale but did not pass the abort signal to the spawned build command. This meant Ctrl-C could appear to hang while Wrangler waited for a custom build command to finish naturally. Custom build commands are now cancelled when the dev session tears down or a newer watched build supersedes them.
