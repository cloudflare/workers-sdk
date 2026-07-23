---
"create-cloudflare": patch
---

Fix `git commit` hanging when `commit.gpgsign` is enabled

If you have GPG commit signing configured with a passphrase-protected key, the initial commit created during project setup would appear to hang: the passphrase prompt couldn't get keyboard input because it had to compete with C3's own progress output for control of the terminal. The only way out was Ctrl+C, which also skipped the rest of setup, including the prompt to deploy your new project.

`git commit` now runs the same way it would if you ran it yourself, so passphrase-protected signing keys work as expected. A failure while staging files is also now reported correctly instead of leaving the progress indicator spinning indefinitely.
