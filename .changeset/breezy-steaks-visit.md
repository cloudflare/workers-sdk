---
"wrangler": patch
---

fix: We want to prevent any user created code from sending Events to Sentry,
which can be captured by `uncaughtExceptionMonitor` listener.
Miniflare code can run user code on the same process as Wrangler,
so we want to return `null` if `@miniflare` is present in the Event frames.
