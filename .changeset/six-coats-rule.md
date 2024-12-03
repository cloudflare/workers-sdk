---
"wrangler": minor
---

feat: add `experimental_serve_directly` option to Workers with Assets

Users can now specify whether their assets are served directly against HTTP requests or whether these requests always go to the Worker, which can then respond with asset retrieved by its assets binding.
