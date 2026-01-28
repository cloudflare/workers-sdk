---
"wrangler": patch
---

Fixed Durable Object missing migrations warning message.

If a Workers project includes some `durable_objects` in it but no `migrations` we show a warning to the user to add `migrations` to their config. However, this warning recommended `new_classes` for their migrations, but we instead now recommend all users use `new_sqlite_classes` instead.
