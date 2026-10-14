---
"@cloudflare/vite-plugin": major
---

Default the entry Worker to the `ssr` Vite environment

The entry Worker's Vite environment now defaults to `ssr` instead of deriving its name from the Worker name. Projects whose Vite configuration or plugins target the entry environment by its previous Worker-derived name must target `environments.ssr`, or preserve the previous name by setting `viteEnvironment.name` explicitly.
