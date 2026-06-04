---
"miniflare": minor
---

Add support for serving R2 bucket objects publicly via the dev server

R2 buckets now accept an `experimentalLocalPublic` option that, when set, exposes the bucket's objects under `/cdn-cgi/mf/r2/<bucket-id>/<key>` on the existing user-facing dev server. The endpoint supports GET and HEAD, range requests, conditional headers, and forwards stored HTTP metadata.

```js
const mf = new Miniflare({
	r2Buckets: { BUCKET: { id: "bucket", experimentalLocalPublic: true } },
	// ...
});
const url = await mf.ready;
// objects are reachable at e.g. <url>/cdn-cgi/mf/r2/bucket/my-key
```
