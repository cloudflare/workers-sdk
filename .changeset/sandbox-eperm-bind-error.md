---
"wrangler": patch
---

Improve error message when port binding is blocked by a sandbox or security policy

When running `wrangler dev` inside a restricted environment (such as an AI coding agent sandbox or locked-down container), the port availability check would fail with a raw `EPERM` error. This now provides a clear message explaining that a sandbox or security policy is blocking network access, rather than the generic permission error that previously pointed at the file system.
