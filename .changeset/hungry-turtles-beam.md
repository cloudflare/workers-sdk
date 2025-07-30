---
"wrangler": patch
---

Add support for custom instance limits for containers. For example, instead of
having to use the preconfigured dev/standard/basic instance types, you can now
set:

```
instance_type: {
  vcpu: 1,
  memory_mib: 1024,
  disk_mb: 4000
}
```

This feature is currently only available to customers on an enterprise plan.
