---
"wrangler": patch
---

fix: don't crash when browser windows don't open

We open browser windows for a few things; during `wrangler dev`, and logging in. There are environments where this doesn't work as expected (like codespaces, stackblitz, etc). This fix simply logs an error instead of breaking the flow. This is the same fix as https://github.com/cloudflare/wrangler2/pull/263, now applied to the rest of wrangler.
