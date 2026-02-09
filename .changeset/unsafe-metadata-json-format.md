---
"wrangler": patch
---

fix: Display unsafe metadata separately from bindings

Unsafe metadata are not bindings and should not be displayed in the bindings table. They are now printed as a separate JSON block.

Before:

```
Your Worker has access to the following bindings:
Binding                               Resource
env.extra_data ("interesting value")  Unsafe Metadata
env.more_data ("dubious value")       Unsafe Metadata
```

After:

```
The following unsafe metadata will be attached to your Worker:
{
  "extra_data": "interesting value",
  "more_data": "dubious value"
}
```
