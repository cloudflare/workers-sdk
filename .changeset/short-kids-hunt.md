---
"wrangler": minor
---

Rename wrangler pipelines <create|update> flags, add `--cors-origins` flag

The following parameters have been renamed:

| Previous Name     | New Name              |
| ----------------- | --------------------- |
| access-key-id     | r2-access-key-id      |
| secret-access-key | r2-secret-access-key  |
| transform         | transform-worker      |
| r2                | r2-bucket             |
| prefix            | r2-prefix             |
| binding           | enable-worker-binding |
| http              | enable-http           |
| authentication    | require-http-auth     |
| filename          | file-template         |
| filepath          | partition-template    |

Adds the following new option for `create` and `update` commands:

```
--cors-origins           CORS origin allowlist for HTTP endpoint (use * for any origin)  [array]
```
