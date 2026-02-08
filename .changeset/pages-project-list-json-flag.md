---
"wrangler": minor
---

Add `--json` flag to `wrangler pages project list` command

You can now use the `--json` flag to output the project list as clean JSON instead of a formatted table. This enables easier programmatic processing and scripting workflows.

```sh
> wrangler pages project list --json

[
  {
    "Project Name": "my-pages-project",
    "Project Domains": "my-pages-project-57h.pages.dev",
    "Git Provider": "No",
    "Last Modified": "23 hours ago"
  },
  ...
]
```
