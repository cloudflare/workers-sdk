---
"create-cloudflare": patch
---

fix: make sure that all C3 projects include in their `.gitignore` the wrangler files

Previously only the worker templates included in their `.gitignore` the wrangler files
(those being `.dev.vars` and `.wrangler`). Make sure to instead include such files in
the `.gitignore` files of all the templates including the full stack ones.
