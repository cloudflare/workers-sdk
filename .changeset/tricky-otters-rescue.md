---
"miniflare": minor
---

add `unsafeEvalBinding` option

Add option to leverage the newly introduced [`UnsafeEval`](https://github.com/cloudflare/workerd/pull/1338) workerd binding API,
such API is used to evaluate javascript code at runtime via the provided `eval` and `newFunction` methods.

The API, for security reasons (as per the [workers docs](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#javascript-standards)), is not to be use in production but it is intended for local purposes only such as local testing.

To use the binding you need to specify a string value for the `unsafeEvalBinding`, such will be the name of the `UnsafeEval` bindings that will be made available in the workerd runtime.

For example the following code shows how to set the binding with the `UNSAFE_EVAL` name and evaluate the `1+1` string:

```ts
const mf = new Miniflare({
	log,
	modules: true,
	script: `
      export default {
          fetch(req, env, ctx) {
              const two = env.UNSAFE_EVAL.eval('1+1');
              return new Response('two = ' + two); // returns 'two = 2'
          }
      }
  `,
	unsafeEvalBinding: "UNSAFE_EVAL",
});
```
