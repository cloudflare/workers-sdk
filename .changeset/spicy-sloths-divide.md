---
"@cloudflare/unenv-preset": patch
---

enabled native `node:fs` and `node:os` modules.

native `node:fs` is used when the `enable_nodejs_fs_module` is set or by default starting from 2025-09-15.

native `node:os` is used when the `enable_nodejs_os_module` is set or by default starting from 2025-09-15
