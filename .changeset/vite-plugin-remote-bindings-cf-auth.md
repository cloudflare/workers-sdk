---
"@cloudflare/vite-plugin": patch
---

Use cf credentials for remote bindings in `vite dev` and `vite preview`

Remote bindings previously used cf credentials only when Vite was started by `cf dev`. Log in with `cf auth login` or set `CLOUDFLARE_API_TOKEN`.
