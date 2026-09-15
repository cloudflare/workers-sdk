---
"wrangler": patch
---

Make container image build and push output concise

Wrangler now shows compact image progress with elapsed time while hiding successful Docker build, login, tag, and push output. Failures retain bounded diagnostics, and `WRANGLER_LOG=debug` restores live Docker output.
