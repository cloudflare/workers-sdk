---
"wrangler": patch
---

fix: avoid path collisions between performance and Performance Node.js polyfills

It turns out that ESBuild paths are case insensitive, which can result in path collisions between polyfills for `globalThis.performance` and `globalThis.Performance`, etc.

This change ensures that we encode all global names to lowercase and decode them appropriately.
