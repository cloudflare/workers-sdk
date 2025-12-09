---
"@cloudflare/cli": patch
---

fix: correct pagination calculations in select prompts to handle hidden options and terminal resize

- Fixed `getSelectRenderers` to use `visibleOptions.length` instead of `options.length` for pagination calculations, preventing incorrect item visibility when hidden options exist
- Moved terminal `rows` retrieval inside the renderer function in `getSelectListRenderers` so it updates on terminal resize
