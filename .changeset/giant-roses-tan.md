---
"wrangler": patch
---

fix: enable debugger in local mode

During a refactor, we missed enabling the inspector by default in local mode. We also broke the logic that detects the inspector url exposed by the local server. This patch passes the argument correctly, fixes the detection logic. Further, it also lets you disable the inspector altogether with `--inspect false`, if required (for both remote and local mode).

Fixes https://github.com/cloudflare/wrangler2/issues/1436
