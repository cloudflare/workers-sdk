---
"wrangler": patch
---

chore: refactor some common code into `requireAuth()`

There was a common chunk of code across most commands that ensures a user is logged in, and retrieves an account ID. I'd resisted making this into an abstraction for a while. Now that the codebase is stable, and https://github.com/cloudflare/wrangler2/pull/537 removes some surrounding code there, I made an abstraction for this common code as `requireAuth()`. This gets a mention in the changelog simply because it touches a bunch of code, although it's mostly mechanical deletion/replacement.
