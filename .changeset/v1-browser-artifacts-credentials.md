---
"@cloudflare/vite-plugin": patch
---

Update Miniflare to protect local Browser Rendering and Artifacts credentials

Local Browser Rendering receives browser configuration and a usable home directory without unrelated host credentials. Local Artifacts Git forwarding also strips `X-Auth-Key` before passing requests to the repository.
