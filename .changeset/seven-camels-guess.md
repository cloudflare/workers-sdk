---
"miniflare": patch
---

remove explicit disposal on void-returning rpc method on workflow binding. This was adding extra dispose calls that were not needed, making the runtime noisy for the customers that saw internal errors unrelated to their code.
