---
"create-cloudflare": patch
---

remove `Application Starter` option in C3 experimental menu

There are currently no experimental application starters so when running C3 in experimental mode
and selecting such category users see an empty list of choices, this is a bit pointless so this PR
is removing such category entirely
