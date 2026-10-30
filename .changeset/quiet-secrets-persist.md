---
"miniflare": patch
---

Restrict access to local Secrets Store persistence directories

On POSIX systems, new and existing local Secrets Store directories are restricted to their owner before storage is opened. Startup fails if the directory cannot be secured, belongs to another user, or is a symbolic link. Windows continues to use inherited filesystem access controls.
