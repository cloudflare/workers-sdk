---
"wrangler": patch
---

fix: extract Cloudflare_CA.pem to temp dir before using it

With package managers like yarn, the cloudflare cert won't be available on the filesystem as expected (since the module is inside a .zip file). This fix instead extracts the file out of the module, copies it to a temporary directory, and directs node to use that as the cert instead, preventing warnings like https://github.com/cloudflare/wrangler2/issues/1136.

Fixes https://github.com/cloudflare/wrangler2/issues/1136
