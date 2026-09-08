---
"miniflare": patch
"wrangler": patch
---

Log browser-made requests at debug level in dev

A browser asks for `/favicon.ico` on its own, and Chrome DevTools probes `/.well-known/appspecific/com.chrome.devtools.json` on every page load. Neither is a request you made, and on a page you reload often they crowd out your app's own traffic in the `wrangler dev` request log.

These are now logged at `debug` instead of `info`, so a default session stays quiet while `--log-level debug` still shows every request. If the Worker returns a 5xx serving one of them it stays at `info`, so a broken handler is never quietly demoted.
