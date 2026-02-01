---
"wrangler": patch
---

Warn when multiple configuration files exist in the same directory

When both `wrangler.json` and `wrangler.toml` (or any combination of supported config files) exist in the same directory, Wrangler now displays a warning explaining which file is being used and which are being ignored. The warning also explains how to resolve the conflict by either deleting unused config files or using the `--config` flag to explicitly specify which file to use.
