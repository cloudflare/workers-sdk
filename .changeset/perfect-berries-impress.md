---
"wrangler": minor
---

feature: whoami, logout and login commands mention the CLOUDFLARE_API_TOKEN env var now

It is easy to get confused when trying to logout while the CLOUDFLARE_API_TOKEN env var is set.
The logout command normally prints out a message which states that the user is not logged in. This
change rectifes this to explicitly call out that the CLOUDFLARE_API_TOKEN is set and requests that
the user unsets it to logout.
