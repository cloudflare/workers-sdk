---
"wrangler": patch
---

fix: pass correct query param when uploading a script

In f9c1423f0c5b6008f05b9657c9b84eb6f173563a the query param was incorrectly changed from
`available_on_subdomain` to `available_on_subdomains`.
