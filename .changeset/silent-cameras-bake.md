---
"wrangler": patch
---

Fix container rebuild hotkey not working when Docker build is interrupted

When pressing 'r' to rebuild containers during a long-running Docker build, the build was being cancelled but wrangler would crash instead of starting a new build. This was because the error handler only checked for exit code 1, but SIGINT produces exit code 130. The fix now properly handles any Docker build exit code when the abort was user-initiated.
