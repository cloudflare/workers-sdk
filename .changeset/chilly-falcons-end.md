---
"wrangler": patch
---

fix: Throw a descriptive error when autoconfig cannot detect an output directory

When running `wrangler setup` or `wrangler deploy --x-autoconfig` on a project where the output directory cannot be detected, you will now see a clear error message explaining what's missing (e.g., "Could not detect a directory containing the static (html, css and js) files for the project") instead of a generic configuration error. This makes it easier to understand and resolve the issue.
