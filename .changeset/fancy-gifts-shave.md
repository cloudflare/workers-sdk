---
"wrangler": minor
---

Add validation retry loops to pipelines setup command

The `wrangler pipelines setup` command now prompts users to retry when validation errors occur, instead of failing the entire setup process. This includes:

- Validation retry prompts for pipeline names, bucket names, and field names
- A "simple" mode for sink configuration that uses sensible defaults
- Automatic bucket creation when buckets don't exist
- Automatic Data Catalog enablement when not already active

This improves the setup experience by allowing users to correct mistakes without restarting the entire configuration flow.
