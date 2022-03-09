---
"wrangler": patch
---

fix: wrangler dev on unnamed workers in remote mode

With unnamed workers, we use the filename as the name of the worker, which isn't a valid name for workers because of the `.` (This break was introduced in https://github.com/cloudflare/wrangler2/pull/545). The preview service accepts unnamed workers and generates a hash anyway, so the fix is to simply not send it, and use the host that the service provides.
