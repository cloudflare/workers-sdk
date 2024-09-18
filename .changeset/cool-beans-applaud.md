---
"miniflare": patch
---

fix: Fix Miniflare regression introduced in #5570

PR #5570 introduced a regression in Miniflare, namely that declaring Queue Producers like `queueProducers: { "MY_QUEUE": "my-queue" }` no longer works. This commit fixes the issue.

Fixes #5908
