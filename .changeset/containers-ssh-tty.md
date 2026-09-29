---
"@cloudflare/containers-shared": minor
"wrangler": minor
---

Add `--tty` (`-t`) flag to `wrangler containers ssh` to force pseudo-terminal allocation

OpenSSH only allocates a pseudo-terminal when no remote command is given, so interactive commands such as `wrangler containers ssh <ID> -- bash` previously ran without a prompt or line editing. Pass `--tty` to force one:

`wrangler containers ssh <ID> --tty -- bash`
