---
"@cloudflare/config": minor
---

Add standalone Container configuration to the experimental config API

Container applications can now be declared with `defineContainer`, exported alongside Workers, and referenced directly from SQLite Durable Object exports. The new input and output schemas support the camel-cased Container configuration format and require output to use an image reference.

Support currently only exists in the config package and has not been added to its consumers.
