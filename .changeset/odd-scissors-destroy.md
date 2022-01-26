---
"wrangler": patch
---

refactor: implement a logging abstraction around console

This change implements a `logger` service that should be used instead of `console`.

The eslint configuration for the wrangler package `src` directory has been updated to error if someone tries to use `console` rather than `logger`.

As well as providing a clean abstraction, this change also enables simpler testing of some Ink components.

Specifically when an Ink component is used only to statically generate some output, we can now use the `renderString()` method to render the output to a string, which can be sent to the logger.
