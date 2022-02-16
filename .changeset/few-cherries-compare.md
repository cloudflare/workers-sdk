---
"wrangler": patch
---

bugfix: Replace `.destroy()` on `faye-websockets` with `.close()`
added: Interface to give faye same types as compliant `ws` with additional `.pipe()` implementation; `.on("message" => fn)`
