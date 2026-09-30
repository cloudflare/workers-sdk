---
"wrangler": patch
---

Keep colons in `wrangler tail --header` filter values

`wrangler tail --header` splits its argument into a header name and an optional value at the colon. It split at every colon and kept only the first two parts, so a value containing a colon was cut short: `--header "Origin:https://app.example.com"` filtered on `https`. The value now includes everything after the first colon, so URLs, ports and IPv6 addresses are sent to the tail filter intact.
