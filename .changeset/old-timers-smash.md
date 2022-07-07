---
"wrangler": patch
---

polish: Compliance with the XDG Base Directory Specification
Wrangler was creating a config file in the home directory of the operating system `~/.wrangler`. The XDG path spec is a
standard for storing files, these changes include XDG pathing compliance for `.wrangler/*` location and backwards compatibilty with previous
`~/.wrangler` locations.

resolves #1053
