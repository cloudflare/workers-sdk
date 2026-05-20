---
"miniflare": patch
---

Recover from corrupted `@puppeteer/browsers` cache when launching a Browser Run session

When Miniflare's local Browser Run binding launches Chrome, it calls `@puppeteer/browsers`' `install()` to ensure the binary is present. If a previous `install()` was interrupted mid-extraction (test timeout, process kill, antivirus quarantine), the cache directory can be left partially populated — the folder exists but the executable inside it is missing. `install()` then throws `The browser folder (...) exists but the executable (...) is missing` on every subsequent call within the same process and the entire test session, breaking every later Browser Run operation until the cache is manually cleared.

`launchBrowser` now catches that specific error, removes the corrupted cache directory, and retries `install()` once. If the corruption persists after cleanup, the original error is rethrown with a clearer message.

This complements [#13971](https://github.com/cloudflare/workers-sdk/pull/13971), which surfaced the original error from inside the binding worker. With that diagnostic in place and this self-healing layer, the previously-intermittent "browser folder exists but executable missing" failure mode should no longer fail an entire CI run.
