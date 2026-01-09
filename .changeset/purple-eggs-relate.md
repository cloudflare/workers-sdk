---
"@cloudflare/unenv-preset": minor
---

Export the list of built-in node modules that are available without the `node:` prefix.
Modules that are only available with the `node:` are not included (i.e. `node:sqlite`).
Note that new modules will be added with the `node:` prefix only and not be added to the list.
