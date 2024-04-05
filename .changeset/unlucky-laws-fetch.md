---
"wrangler": minor
---

R2 will introduce storage classes soon. Wrangler allows you to interact with storage classes once it is
enabled on your account.

Wrangler supports an `-s` flag that allows the user to specify a storage class when creating a bucket,
changing the default storage class of a bucket, and uploading an object.

```bash
wrangler r2 bucket create ia-bucket -s InfrequentAccess
wrangler r2 bucket update storage-class my-bucket -s InfrequentAccess
wrangler r2 object put bucket/ia-object -s InfrequentAccess --file foo
```
