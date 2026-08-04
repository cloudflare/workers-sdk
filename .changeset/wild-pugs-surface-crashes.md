---
"miniflare": patch
---

Surface the full runtime crash report when workerd crashes, and warn when it is restarted

When workerd crashed, the banner (e.g. `*** std::terminate() called with no exception`) was reported without its stack trace, because the stack trace was being filtered out along with the ordinary hex-stack noise workerd emits. The crash was therefore impossible to diagnose. The `stack:` line and the missing-`$LLVM_SYMBOLIZER` notice that follow a fatal crash banner are now kept, and the whole report is logged at `error` level.

Miniflare also recovers from workerd crashes by restarting the runtime, but did so silently, which made a crash look like an unexplained dev server restart. It now warns, including a count so that a repeatedly-crashing runtime is distinguishable from a one-off.
