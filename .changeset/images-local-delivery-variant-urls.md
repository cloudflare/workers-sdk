---
"miniflare": patch
---

Improve variant URLs returned by the hosted images mock for local development

The miniflare hosted images mock previously returned bare variant names (e.g. `"public"`) in the `variants` field of `ImageMetadata`. In production, this field contains full delivery URLs. The bare names were not usable as image sources, causing applications that render images from variant URLs to fail during local development.

Variant URLs now point to a new local delivery endpoint at `/cdn-cgi/imagedelivery/<image_id>/<variant>` which serves image bytes directly from the local KV store with content-type detection via Sharp.
