---
"wrangler": patch
---

fix: listen on loopback for wrangler dev port check and login

Avoid listening on the wildcard address by default to reduce the attacker's
surface and avoid firewall prompts on macOS.

Relates to #4430.
