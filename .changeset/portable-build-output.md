---
"@cloudflare/build-output-utils": minor
---

Reject symlinks when reading experimental Build Output directories

Build Output directories must be portable and self-contained. The shared reader now rejects symlinks anywhere in the output tree, including links to files within it, and reports the offending path in a Build Output error before reading configs.
