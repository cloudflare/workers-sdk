---
"@cloudflare/vite-plugin": patch
---

Enable HTML handling for HTML files in the public directory.

It is generally encouraged to use [HTML files as entry points](https://vite.dev/guide/features#html) in Vite so that their dependencies are bundled. However, if you have plain HTML files that should simply be copied to the root of the output directory as-is, you can place these in the [public directory](https://vite.dev/guide/assets#the-public-directory) and they will now work as expected in dev.
