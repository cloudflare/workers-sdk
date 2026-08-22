---
"@cloudflare/vite-plugin": patch
---

Fix `vite build` hanging when `remoteBindings` is enabled

With `remoteBindings` enabled, `vite build` produced all of its output but then never exited, so builds had to be killed manually and could not complete in CI. Builds using remote bindings now finish and exit as expected.
