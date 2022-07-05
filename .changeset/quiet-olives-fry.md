---
"wrangler": patch
---

feat: implement fetch for wrangler's unstable_dev API, and write our first integration test.

Prior to this PR, users of `unstable_dev` had to provide their own fetcher, and guess the address and port that the wrangler dev server was using.

With this implementation, it's now possible to test wrangler, using just wrangler (and a test framework):

```js
describe("worker", async () => {
  const worker = await wrangler.unstable_dev("src/index.ts");

  const resp = await worker.fetch();

  expect(resp).not.toBe(undefined);
  if (resp) {
    const text = await resp.text();
    expect(text).toMatchInlineSnapshot(`"Hello World!"`);
  }

  worker.stop();
}
```

Closes #1383
Closes #1384
Closes #1385
