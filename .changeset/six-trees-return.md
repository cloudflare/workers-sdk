---
"wrangler": patch
---

fix: Only generate `Link` headers from simple `<link>` elements.

Specifically, only those with the `rel`, `href` and possibly `as` attributes. Any element with additional attributes will not be used to generate headers.
