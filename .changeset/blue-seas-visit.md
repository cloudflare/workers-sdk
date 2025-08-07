---
"wrangler": patch
---

fix: validate `wrangler containers delete ID` to ensure a valid ID has been provided. Previously if you provided the container name (or any non-ID shaped string) you would get an auth error instead of a 404.
