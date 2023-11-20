---
"wrangler": minor
---

Wrangler now writes all logs to a .log file in the `.wrangler` directory. Set a directory or specific .log filepath to write logs to with `WRANGLER_LOG_PATH=../Desktop/my-logs/` or `WRANGLER_LOG_PATH=../Desktop/my-logs/my-log-file.log`. When specifying a directory or using the default location, a filename with a timestamp is used.

Wrangler now filters workerd stdout/stderr and marks unactionable messages as debug logs. These debug logs are still observable in the debug log file but will no longer show in the terminal by default without the user setting the env var `WRANGLER_LOG=debug`.
