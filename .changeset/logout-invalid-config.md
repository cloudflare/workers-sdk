---
"wrangler": patch
---

Prevent `wrangler logout` from failing when the Wrangler configuration file is invalid

Previously, if your `wrangler.toml` or `wrangler.json` file contained syntax errors or invalid values, the `wrangler logout` command would fail. Now, configuration parsing errors are caught and logged at debug level, allowing you to log out regardless of the state of your configuration file.
