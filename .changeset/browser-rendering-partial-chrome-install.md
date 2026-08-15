---
"miniflare": patch
---

Recover automatically from a partially downloaded Chrome install for the Browser Run binding

If the Chrome download for a `browser` binding was interrupted — a cancelled dev session, a killed test run, a machine going to sleep — the next launch could fail indefinitely with `Failed to launch the browser process!`, usually alongside a message about being unable to load `resources.pak`. `@puppeteer/browsers` treats an install as present as soon as the executable exists, and the Chrome archives extract alphabetically, so the executable is written long before the resources it needs. Every subsequent launch then reused the half-written directory, and the only way out was deleting the Chrome cache by hand.

Miniflare now detects this: an install that Chrome has never successfully started from is cleared and re-downloaded on a failed launch, rather than reused forever. Overlapping launches also share a single download instead of racing to populate the same directory.
