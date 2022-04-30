---
"wrangler": patch
---

feat: implement service environments + durable objects

Now that the APIs for getting migrations tags of services works as expected, this lands support for publishing durable objects to service environments, including migrations. It also removes the error we used to throw when attempting to use service envs + durable objects.

Fixes https://github.com/cloudflare/wrangler2/issues/739
