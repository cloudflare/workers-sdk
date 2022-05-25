---
"wrangler": patch
---

fix: batch package manager installs so folks only have to wait once

When running `wrangler init`, we install packages as folks confirm their options.
This disrupts the "flow", particularly on slower internet connections.

To avoid this disruption, we now only install packages once we're done asking questions.

Closes #1036
