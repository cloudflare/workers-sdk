---
"wrangler": patch
---

feat: use host specific callback url

To allow OAuth to work on environments such as WebContainer we have to generate a host-specific callback URL. This PR uses `@webcontainer/env` to generate such URL only for running in WebContainer. Otherwise the callback URL stays unmodified.
