---
"miniflare": patch
---

Limit the environment passed to local Browser Rendering and ensure a usable home directory

Chrome now receives only the host configuration needed for browser operation, keeping unrelated application credentials out of its environment. It uses the operating system account's home directory when `HOME` is missing or empty. If the account cannot be looked up, Chrome uses its temporary profile directory as its home. Temporary browser profiles are created with owner-only permissions on POSIX platforms.
