---
"miniflare": patch
---

Keep reporting uncaught Worker errors when a stack frame's file URL has no local path

`fileURLToPath` throws on `file://` URLs that cannot be represented as a local path (a non-local host; on Windows, any drive-less path — which is every `file:///...` URL reported by a POSIX-built bundle). Both the source-mapping machinery and `youch`'s error-page frame parsing convert stack-frame specifiers this way, so one such frame previously failed the whole pretty-error request: the error page was replaced by a raw Node stack, the error was not logged, and `handleUncaughtError` did not fire. Source mapping now degrades to the unmapped stack and the pretty page falls back to a plain stack response instead.
