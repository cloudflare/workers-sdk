---
"miniflare": minor
---

Support `captions.get()` and `customerCode` in the local Stream binding

The local Stream binding now implements the Stream fields added in `@cloudflare/workers-types`. `captions.get(language)` returns the stored WebVTT file for an uploaded caption. Generated captions have no content in local mode, so they return an empty WebVTT file, and a missing caption throws `NotFoundError` as the API does. Videos also include `customerCode`, set to `"placeholder"` to match the placeholder subdomain in local playback URLs.
