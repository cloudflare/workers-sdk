---
"wrangler": minor
---

Automated Wrangler version bump:
Added a command `upgrade` that automates the process of updating the version of Wrangler in the project's `package.json` file to the latest available version.
Note that you will still need to run the package manager to update the `node_modules` after running this command.

resolves #2071
