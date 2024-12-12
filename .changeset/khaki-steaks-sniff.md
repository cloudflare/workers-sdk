---
"wrangler": patch
---

fix: ensure that non-inherited fields are not removed when using an inferred named environment

It is an error for the the user to provide an environment name that doesn't match any of the named environments in the Wrangler configuration.
But if there are no named environments defined at all in the Wrangler configuration, we special case the top-level environment as though it was a named environment.
Previously, when this happens, we would remove all the nonInheritable fields from the configuration (essentially all the bindings) leaving an incorrect configuration.
Now we correctly generate a flattened named environment that has the nonInheritable fields, plus correctly applies any transformFn on inheritable fields.
