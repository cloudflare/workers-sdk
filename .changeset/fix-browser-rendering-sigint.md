---
"miniflare": patch
---

fix: disable per-browser SIGINT and SIGHUP handlers in `@puppeteer/browsers` to allow centralized multi-browser teardown on SIGINT
