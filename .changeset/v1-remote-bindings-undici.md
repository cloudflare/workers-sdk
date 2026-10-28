---
"@cloudflare/vite-plugin": patch
---

Prevent malformed token-exchange responses from crashing remote binding startup

Update the Undici dependency bundled from the retained remote-bindings package to `7.30.1`. Responses with excessive content encodings now reject without a later unhandled stream error when the server closes the connection early.
