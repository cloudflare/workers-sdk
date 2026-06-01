---
"@cloudflare/workers-utils": patch
---

Fix cloudflared SHA256 checksum mismatch on macOS

The update service (`update.argotunnel.com`) returns a checksum for the extracted binary, not the `.tgz` tarball. We were computing the SHA256 of the tarball itself, which always mismatched on macOS where cloudflared is distributed as a compressed archive.

This aligns with cloudflared's own auto-updater (`cmd/cloudflared/updater/workers_update.go`), which decompresses the tarball first, then checksums the resulting binary. We now do the same: extract, then verify.
