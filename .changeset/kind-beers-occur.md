---
"@cloudflare/vite-plugin": patch
---

Select the appropriate `vite/module-runner` implementation during dev based on the user's Vite version

The plugin now builds against Vite 8 and ships two bundled copies of `vite/module-runner`: one from Vite 8 and one from Vite 7.1.12 (the last version before a breaking change to the module runner in Vite 7.2.0). At dev server startup, the correct implementation is selected based on the user's installed Vite version. This is Vite 8's module runner for users on Vite >= 7.2.0, and the legacy module runner for users on older versions.
