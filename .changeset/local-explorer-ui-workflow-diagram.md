---
"@cloudflare/local-explorer-ui": minor
---

Add workflow diagram to local explorer UI

The workflow detail page now displays an interactive visual diagram of the workflow's step structure alongside the instances table. The diagram renders all step types (do, sleep, sleepUntil, waitForEvent), control flow (if/else, switch, loops, try/catch), parallel execution (Promise.all/race/any/allSettled), and function calls. Includes an expand/collapse toggle, pan/scroll viewport, a refresh button, and copy/download buttons for exporting the diagram as a PNG.
