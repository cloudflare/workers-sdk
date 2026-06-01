---
"create-cloudflare": minor
---

Hide non-framework categories when `--platform=pages` is specified

When running C3 with `--platform=pages`, the "Hello World example" and "Application Starter" categories are now hidden since they only produce Workers projects. The framework list is also filtered to only show frameworks that support the Pages platform. This makes it clear that C3 can only create Pages projects when using a framework.
