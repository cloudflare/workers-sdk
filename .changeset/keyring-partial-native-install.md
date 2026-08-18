---
"@cloudflare/workers-auth": patch
---

Recover from a partially installed keyring backend on Windows

Choosing to keep your credentials in the OS keyring on Windows installs a native backend the first time you opt in. An install interrupted part-way through — by a dropped connection, a full disk, or an npm told to skip optional packages — could leave a broken backend behind that was nonetheless treated as working. Every login, token refresh, and credential read from then on failed with an internal error, and because the broken state was never re-examined, no amount of retrying would clear it.

A broken backend is now spotted and reinstalled automatically. If the reinstall still cannot produce a working one, you get a single explanation of how to install it by hand and fall back to the plaintext credentials file for the rest of the session, rather than sitting through a fresh install attempt on every credential access.
