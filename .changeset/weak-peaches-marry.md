---
"wrangler": minor
---

Wrangler now writes all debug logs to a .log file in the `.wrangler` directory. Enable debug log-mode as usual with `WRANGLER_LOG=debug npx wrangler ...`. Debug logs are no longer printed to the terminal. Set a directory or specific .log filepath to write debug logs to with `WRANGLER_LOG_PATH=~/Desktop/my-logs/` or `WRANGLER_LOG_PATH=~/Desktop/my-logs/my-log-file.log`. When specifying a directory or using the default location, a filename with a timestamp is used.
