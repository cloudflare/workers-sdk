---
"create-cloudflare": minor
---

add final commit when generating Pages projects

before after the user would have completed the creation of a Pages project
they would find the Cloudflare added/modified files uncommitted, instead of
leaving these uncommitted this change adds an extra commit (on top of the
framework specific) which also contains some useful information about the
project
