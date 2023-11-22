---
"wrangler": patch
---

Changes the default directory for log files to workaround frameworks that are watching the entire `.wrangler` directory in the project root for changes

Also includes a fix for commands with `--json` where the log file location message would cause stdout to not be valid JSON. That message now goes to stderr.
