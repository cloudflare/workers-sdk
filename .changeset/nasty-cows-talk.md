---
"create-cloudflare": patch
---

fix: ensure that default project name can be used

If you hit enter when asked for the name of the project, you expect it
to use the default value. But the project name validation was then failing
as it was receiving undefined for the value of the input rather than the
default value.

Now the validator will be passed the default if no value was provided.
