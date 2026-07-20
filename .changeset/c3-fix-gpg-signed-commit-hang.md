---
"create-cloudflare": patch
---

Fix the initial `git commit` hanging when `commit.gpgsign` is enabled

Previously, `gitCommit` kept its own animated spinner running (and ran `git commit` with piped stdio, which itself spun up a second, nested spinner) for the whole duration of the commit. When `commit.gpgsign` is configured, `git commit` invokes GPG, which may need to show an interactive passphrase prompt (e.g. via `pinentry-curses`) directly on the controlling terminal. That prompt would fight C3's own redraw loop(s) for control of the screen, making it impossible to enter the passphrase and leaving the process appearing to hang.

The commit step now stops the spinner and runs `git commit` with inherited stdio, so any interactive prompt (GPG or otherwise) behaves exactly as it would for a normal, manually-run `git commit`.
