---
"wrangler": patch
---

Fix: ensure that when a remote proxy session creation fails a hard error is surfaced to the user (both in `wrangler dev` and in the programmatic API).

When using remote bindings, either with `wrangler dev` or via `startRemoteProxySession`/`maybeStartOrUpdateRemoteProxySession` the remote proxy session necessary to connect to the remote resources can fail to be created, this might happen if for example you try to set a binding with some invalid values such as:

```js
MY_R2: {
	type: "r2_bucket",
	bucket_name: "non-existent", // No bucket called "non-existent" exists
	remote: true,
},
```

Before this could go undetected and cause unwanted behaviors such as requests handling hanging indefinitely, now wrangler will instead crash (or throw a hard error ion the programmatic API), clearly indicating that something went wrong during the remote session's creation.
