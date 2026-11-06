---
"wrangler": minor
---

Support forwarded Wrangler development server options in the experimental `cf-wrangler` delegate

`cf dev` can now forward options such as `--inspector-port 9229`, `--ip`, `--var`, and `--persist-to` to the Wrangler development runtime. The delegate reuses Wrangler's dev option definitions and validation while retaining project config discovery, `--mode` environment selection, local development, and its `.cloudflare/state` default.

Place server options that overlap cf's global options after `--`, for example `cf dev -- --local --persist-to "custom state"`. Config and script overrides, whole-worker remote development, and Wrangler's global options remain unsupported.
