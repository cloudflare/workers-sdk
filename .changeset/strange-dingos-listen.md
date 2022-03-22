---
"wrangler": patch
---

Validate that bindings have unique names

We don't want to have, for example, a KV namespace named "DATA"
and a Durable Object also named "DATA". Then it would be ambiguous
what exactly would live at `env.DATA` (or in the case of service workers,
the `DATA` global) which could lead to unexpected behavior -- and errors.

Similarly, we don't want to have multiple resources of the same type
bound to the same name. If you've been working with some KV namespace
called "DATA", and you add a second namespace but don't change the binding
to something else (maybe you're copying-and-pasting and just changed out the `id`),
you could be reading entirely the wrong stuff out of your KV store.

So now we check for those sorts of situations and throw an error if
we find that we've encountered one.
