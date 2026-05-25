---
"wrangler": patch
---

Show helpful message with URL when browser cannot be opened in headless/container environments

Previously, running `wrangler login` (or any command that opens a browser) in headless Linux environments without `xdg-open` installed would crash with a confusing "A file or directory could not be found — Missing file or directory: xdg-open" error.

Now wrangler catches the error and prints a clear warning with the URL so users can copy-paste it into a browser manually.
