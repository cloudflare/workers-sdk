---
"wrangler": patch
---

Add client-side validation for VPC service host flags

The `--hostname`, `--ipv4`, and `--ipv6` flags on `wrangler vpc service create` and `wrangler vpc service update` now validate input before sending requests to the API. Previously, invalid values were accepted by the CLI and only rejected by the API with opaque error messages. Now users get clear, actionable error messages for common mistakes like passing a URL instead of a hostname, using an IP address in the `--hostname` flag, or providing malformed IP addresses.
