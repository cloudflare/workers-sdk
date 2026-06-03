---
"wrangler": patch
---

Make Ctrl+C triggered during the skills-install prompt dismiss it permanently

Previously, pressing Ctrl+C (SIGINT) during the "Would you like to install Cloudflare skills?" prompt terminated the process without writing the metadata file, causing the prompt to reappear on every subsequent `wrangler` invocation. A SIGINT handler is now registered around the prompt so that the metadata file is written with `accepted: "SIGINT"` before the process exits, preventing the prompt from being shown again.
