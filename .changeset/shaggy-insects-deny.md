---
"@cloudflare/workers-shared": patch
---

Bugfix: Removes unnecessary cloning of the request. This is no longer needed. We were also seeing failures in runtime for large files due to this.
