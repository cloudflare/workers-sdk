---
"wrangler": patch
---

Report a failed Wrangler command when the CLI child is terminated by a signal

Wrangler's executable previously translated signal termination into exit code 0, which could cause callers to report a successful deployment after the operating system stopped Wrangler. Signal exits now use the conventional nonzero shell status.
