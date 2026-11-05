---
"miniflare": patch
---

Preserve the user environment when launching local Browser Rendering

Chrome now inherits the parent process environment and uses the operating system account's home directory when `HOME` is missing or empty. If the account cannot be looked up, Chrome uses its temporary profile directory as its home. Temporary browser profiles are created with owner-only permissions on POSIX platforms.
