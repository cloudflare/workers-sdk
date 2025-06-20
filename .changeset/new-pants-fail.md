---
"wrangler": patch
---

remove warnings during config validations on `experimental_remote` fields

wrangler commands, run without the `--x-remote-bindings` flag, parsing config files containing `experimental_remote` fields currently show warnings stating that the field is not recognized. This is usually more cumbersome than helpful so here we're loosening up this validation and making wrangler always recognize the field even when no `--x-remote-bindings` flag is provided
