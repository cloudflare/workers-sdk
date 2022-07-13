---
"wrangler": patch
---

fix: ensure that metrics user interactions do not break other UI

The new metrics usage capture may interact with the user if they have not yet set their metrics permission.
Sending metrics was being done concurrently with other commands, so there was a chance that the metrics UI broke the other command's UI.
Now we ensure that metrics UI will happen synchronously.
