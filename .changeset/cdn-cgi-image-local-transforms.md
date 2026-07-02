---
"miniflare": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add local-dev support for `/cdn-cgi/image/...` URL transformations

`wrangler dev` can now serve the `/cdn-cgi/image/<options>/<source>` URL endpoint locally, mirroring production image transformation functionality. The transform itself runs through the existing sharp-backed loopback that already powers `cf.image` fetches and the `env.IMAGES` binding, so it's a low-fidelity mock — resize, rotate, format conversion and a small set of options only.

Opt in per-worker via a new `url_transformations` block on the existing `images` config:

```jsonc
{
	"images": {
		"binding": "IMAGES",
		"url_transformations": { "enabled": true },
	},
}
```

When the flag is on, miniflare intercepts `/cdn-cgi/image/...`, parses the options, fetches the source URL and performs the transform. The response carries `cf-resized: internal=ok/m`, matching the production header. When the flag is off (or absent), miniflare passes the request through to the user worker.

A one-shot warning fires the first time `/cdn-cgi/image/...` is hit with the flag on, flagging that the local transform is a low-fidelity sharp-backed mock.

Notes:

- Production gating still needs to be plumbed through the Edgeworker Config Service for the same toggle to take effect outside `wrangler dev`. That work lives elsewhere.
- `images.binding` is still required in the Wrangler config for now — users wanting only the URL endpoint can pass any binding name and ignore `env.IMAGES`. Relaxing this needs a small refactor of `convertConfigToBindings` and will follow.
- Only the default `/cdn-cgi/image/...` URL flavour (and the transparent `flow` adapter) is supported locally; `fastly` and `akamai` adapter URLs are not parsed and fall through.
