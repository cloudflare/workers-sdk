---
"wrangler": patch
---

Do not include .wrangler and Wrangler config files in additional modules

Previously, if you added modules rules such as `**/*.js` or `**/*.json`, specified `no_bundle: true`, and the entry-point to the Worker was in the project root directory, Wrangler could include files that were not intended, such as `.wrangler/tmp/xxx.js` or the Wrangler config file itself. Now these files are automatically skipped when trying to find additional modules by searching the file tree.
