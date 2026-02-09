---
"wrangler": patch
---

Add debug logs for git branch detection in `wrangler pages deploy` command

When running `wrangler pages deploy`, the command automatically detects git information (branch, commit hash, commit message, dirty state) from the local repository. Previously, when this detection failed, there was no way to troubleshoot the issue.

Now, running with `WRANGLER_LOG=debug` will output detailed information about:

- Whether a git repository is detected
- Each git command being executed and its result
- The detected values (branch, commit hash, commit message, dirty status)
- Any errors that occur during detection

Example usage:

```bash
WRANGLER_LOG=debug wrangler pages deploy ./dist --project-name=my-project
```
