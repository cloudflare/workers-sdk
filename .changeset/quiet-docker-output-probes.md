---
"@cloudflare/containers-shared": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Fix optional Docker lookups printing Docker CLI errors during successful builds

`cf build` looks for Container images left behind by earlier builds so it can remove them. This lookup is best effort, but when Docker could not be reached it still printed errors such as `Cannot connect to the Docker daemon`, even when the build succeeded and no image needed Docker. Docker commands whose output Wrangler reads no longer forward the Docker CLI's error output to the terminal. If one of these commands fails in a way that stops the command, the error message still includes the Docker CLI's output.
