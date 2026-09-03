---
"@cloudflare/vite-plugin": major
---

Default the entry Worker to the `ssr` Vite environment

The entry Worker's Vite environment now defaults to `ssr` instead of deriving its name from the Worker name. Vite configuration targeting the entry environment should use `environments.ssr`, or configure an explicit name with `viteEnvironment.name`.

The experimental prerender Worker now similarly defaults to the `prerender` environment. Auxiliary Worker environment names continue to derive from their Worker names.
