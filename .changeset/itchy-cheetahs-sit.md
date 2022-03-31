---
"wrangler": patch
---

fix: exit dev if build fails on first run

Because of https://github.com/evanw/esbuild/issues/1037, we can't recover dev if esbuild fails on first run. The workaround is to end the process if it does so, until we have a better fix.

Reported in https://github.com/cloudflare/wrangler2/issues/731
