---
"wrangler": patch
---

fix: respect variable binding type when printing

After this change, when printing the bindings it has access to, wrangler will correctly only add quotes around string variables, and serialize objects via JSON.stringify (rather than printing `"[object Object]"`).
