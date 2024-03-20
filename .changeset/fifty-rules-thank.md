---
"wrangler": minor
---

feat: Implement environment inheritance for Pages configuration

For Pages, Wrangler will not require both of the supported named environments ("preview" | "production") to be explicitly defined in the config file. If either `[env.production]` or `[env.preview]` is left unspecified, Wrangler will use the top-level environment when targeting that named Pages environment.
