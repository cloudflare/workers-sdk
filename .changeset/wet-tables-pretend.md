---
"wrangler": patch
---

fix: abort async operations in the `Remote` component to avoid unwanted side-effects
When the `Remote` component is unmounted, we now signal outstanding `fetch()` requests, and
`waitForPortToBeAvailable()` tasks to cancel them. This prevents unexpected requests from appearing
after the component has been unmounted, and also allows the process to exit cleanly without a delay.

fixes #375
