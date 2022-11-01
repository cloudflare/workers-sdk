---
"wrangler": patch
---

feat: Add a `passThroughOnException()` handler in Pages Functions

This `passThroughOnException()` handler is not as good as the built-in for Workers. We're just adding it now as a stop-gap until we can do the behind-the-scenes plumbing required to make the built-in function work properly.

We wrap your Pages Functions code in a `try/catch` and on failure, if you call `passThroughOnException()` we defer to the static assets of your project.

For example:

```ts
export const onRequest = ({ passThroughOnException }) => {
	passThroughOnException();

	x; // Would ordinarily throw an error, but instead, static assets are served.
};
```
