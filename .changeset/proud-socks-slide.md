---
"@cloudflare/vite-plugin": patch
---

Fix: Ensure that `vite dev` and `vite preview` hard error with an appropriate error message when a remote proxy session is required but it the connection with it fails to be established

When using remote bindings, either with `vite dev` or `vite preview` the remote proxy session necessary to connect to the remote resources can fail to be created, this might happen if for example you try to set a binding with some invalid values such as:

```js
MY_R2: {
	type: "r2_bucket",
	bucket_name: "non-existent", // No bucket called "non-existent" exists
	remote: true,
},
```

Before this could go undetected and cause unwanted behaviors such as requests handling hanging indefinitely, now a hard error will be thrown instead causing the vite process to crash, clearly indicating that something went wrong during the remote session's creation.
