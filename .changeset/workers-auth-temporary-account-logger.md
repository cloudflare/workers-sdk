---
"@cloudflare/workers-auth": minor
---

Add a `temporaryAccountLogger` option for temporary-account notices

`AuthContext.temporaryAccountLogger` receives the terms notice, the proof-of-work message, and the "Temporary account ready" claim details. A CLI whose commands write parseable output to stdout can route these messages to stderr. When it is not set, the messages go to `logger` as before.
