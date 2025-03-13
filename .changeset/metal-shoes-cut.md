---
"create-cloudflare": patch
---

Remove categories in C3 that have no templates

The `Application Starter` category doesn't contain any entries in experimental mode so we shouldn't show it.

This change updates C3 to automatically exclude categories that have no templates.
