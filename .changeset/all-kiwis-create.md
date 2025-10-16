---
"wrangler": minor
---

Config `preview_urls` defaults to `workers_dev` value.

Originally, we were defaulting config.preview_urls to `true`, but we
were accidentally enabling Preview URLs for users that only had
config.workers_dev=false.

Then, we set the default value of config.preview_urls to `false`, but we
were accidentally disabling Preview URLs for users that only had
config.workers_dev=true.

Rather than defaulting config.preview_urls to `true` or `false`, we
default to the resolved value of config.workers_dev. Should result in a
clearer user experience.
