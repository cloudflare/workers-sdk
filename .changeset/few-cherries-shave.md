---
"wrangler": patch
---

fix: throw appropriate error when we detect an unsupported version of node

When we start up the CLI, we check what the minimum version of supported node is, and throw an error if it isn't at least 16.7. However, the script that runs this, imports `node:child_process` and `node:path`, which was only introduced in 16.7. It was backported to older versions of node, but only in last updates to majors. So for example, if someone used 14.15.4, the script would throw because it wouldn't be able to find `node:child_process` (but it _would_ work on v14.19.2).

The fix here is to not use the prefixed versions of these built-ins in the bootstrap script. Fixes https://github.com/cloudflare/wrangler2/issues/979
