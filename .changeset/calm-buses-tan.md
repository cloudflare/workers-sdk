---
"wrangler": minor
---

feat: Implement config file validation for Pages projects

Wrangler proper has a mechanism in place through which it validates a wrangler.toml file for Workers projects. As part of adding wrangler toml support for Pages, we need to put a similar mechanism in place, to validate a configuration file against Pages specific requirements.
