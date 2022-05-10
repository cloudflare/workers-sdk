---
"wrangler": patch
---

fix: resize tearing
The UI would leave behind artifacts in the console during resizing.
This workaround listens for resize event and clears the console which
will have the undesirable effect of losing current console context.

resolves #374
