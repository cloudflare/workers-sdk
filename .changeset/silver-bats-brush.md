---
"miniflare": patch
---

fix: decouple KV plugin from secrets store plugin

The KV plugin previously configured both KV namespace and secrets store bindings with the same service name but different persistence paths, causing conflicts when both were defined. This change copies the KV binding implementation into the secrets store plugin and customizes its service name to prevent collisions.
