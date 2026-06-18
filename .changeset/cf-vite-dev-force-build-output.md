---
"@cloudflare/vite-plugin": patch
---

Force the experimental Build Output API on by default in the `cf-vite dev` delegate

`cf-vite dev` now sets `CLOUDFLARE_VITE_FORCE_BUILD_OUTPUT` before booting Vite, matching the behaviour of `cf-vite build`. This enables `experimental.newConfig` and `experimental.newConfig.cfBuildOutput` during development, so both commands of the experimental, internal delegate binary behave consistently.
