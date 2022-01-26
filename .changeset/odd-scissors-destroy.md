---
"wrangler": patch
---

refactor: implement a `renderToString()` helper for static Ink components

This change enables simpler testing of some Ink components.
When an Ink component is used only to statically generate some output, we can now use the `renderToString()` method to render the output to a string, which can be sent to the logger.

This cannot be used for interactive or dynamic components.

The change also updates the whoami command and its tests to demonstrate use of `renderToString()`.
