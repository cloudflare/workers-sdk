---
"wrangler": patch
---

feat: add opt-in usage metrics gathering

This change adds support in Wrangler for sending usage metrics to Cloudflare.
This is an opt-in only feature. We will ask the user for permission only once per device.
The user must grant permission, on a per device basis, before we send usage metrics to Cloudflare.
The permission can also be overridden on a per project basis by setting `send_metrics = false` in the `wrangler.toml`.
If Wrangler is running in non-interactive mode (such as in a CI job) and the user has not already given permission
we will assume that we cannot send usage metrics.

The aim of this feature is to help us learn what and how features of Wrangler (and also the Cloudflare dashboard)
are being used in order to improve the developer experience.
