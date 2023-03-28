---
"wrangler": patch
---

fix: Respect querystring params when calling `.fetch` on a worker instantiated with `unstable_dev`

Previously, querystring params would be stripped, causing issues for test cases that depended on them. For example, given the following worker script:
```js
export default {
  fetch(req) {
    const url = new URL(req.url);
    const name = url.searchParams.get('name');
    return new Response('Hello, ' + name);
  }
}
```

would fail the following test case:
```js
const worker = await unstable_dev('script.js');
const res = await worker.fetch('http://worker?name=Walshy');
const text = await res.text();
// Following fails, as returned text is 'Hello, null'
expect(text).toBe('Hello, Walshy');
```
