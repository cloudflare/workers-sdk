---
"@cloudflare/workers-utils": patch
---

Extend `startTunnel()` to support email-protected Quick Tunnels

Pass a list of email addresses or domain patterns through `TunnelOptions.allowedMail` to restrict access to a Quick Tunnel.
