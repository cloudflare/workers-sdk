---
"miniflare": patch
---

Throw `ERR_ADDRESS_IN_USE` again when a port is already taken

Recent workerd versions no longer print `Address already in use; toString() = <address>`, so a taken port surfaced as `ERR_RUNTIME_FAILURE` with workerd's raw log. Miniflare now also recognises workerd's newer forms, `bind(): Address already in use (os error <n>)` and `Socket "<name>": bind(): ...` (on Windows also the access-denied error a port held with `SO_EXCLUSIVEADDRUSE` gives), throws `ERR_ADDRESS_IN_USE` (naming the address when workerd says which socket failed), and no longer shows the raw log line on top of that error.
