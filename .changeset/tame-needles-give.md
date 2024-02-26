---
"wrangler": patch
---

fix: Ensures that switching to remote mode during a dev session (from local mode) will correctly use the right zone. Previously, zone detection happened before the dev session was mounted, and so dev sessions started with local mode would have no zone inferred, and would have failed to start, with an ugly error.
