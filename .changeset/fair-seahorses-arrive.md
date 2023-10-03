---
"create-cloudflare": minor
---

Bump supported node version to 18.14.1

We've recently switched out testing infrastructure to test C3 on node version 18.14.1.
As of earlier this month, Node v16 is no longer supported, and many of the underlying
framework scaffolding tools that C3 uses (ex. `create-astro`, `gatsby`) have dropped
support for node v16, which in turn causes C3 to fail for those frameworks.
