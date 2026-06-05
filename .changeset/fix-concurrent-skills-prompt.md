---
"wrangler": patch
---

Prevent concurrent `wrangler dev` instances from fighting over the skills-install prompt

When two `wrangler dev` processes start in parallel, both could reach the interactive "Install Cloudflare skills?" prompt simultaneously. The second process's TTY output would overwrite the first's interactive prompt, making it invisible and unresponsive to the user.

A collision-detection mechanism now prevents this using the metadata JSONC file itself as a lock. Before showing the prompt, each process atomically creates the metadata file with a pending marker containing its PID and waits a 500 ms grace period. If a second process starts during that window, it overwrites the marker with its own PID and skips. The first process detects the PID change after the grace period and also skips. This ensures the prompt is only shown when a single `wrangler dev` instance is running. Stale pending markers (older than 60 seconds, e.g. from a crashed process) are automatically cleaned up.
