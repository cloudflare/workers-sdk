---
"wrangler": patch
---

Improve the error message when a script isn't exported a Durable Object class

Previously, wrangler would error with a message like `Uncaught TypeError: Class extends value undefined is not a constructor or null`. This improves that messaging to be more understandable to users.
