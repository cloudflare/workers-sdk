---
"wrangler": patch
---

Fix a memory leak that could make long-running headless `wrangler dev` sessions unresponsive

Long-running `wrangler dev` sessions with no DevTools attached (for example using the containers feature under sustained traffic) could gradually consume unbounded memory and eventually stop accepting connections. The inspector proxy now only enables network tracking while a DevTools client is connected, so the buildup no longer happens. Interactive debugging is unaffected. Fixes #14191.
