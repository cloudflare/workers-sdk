---
"miniflare": patch
---

fix: normalise typed array subclasses in devalue serialization

Node.js `Buffer` extends `Uint8Array` but isn't available in all runtimes. When
a `Buffer` was passed through the proxy serialization bridge (e.g. as a D1 bind
parameter via `getPlatformProxy()`), the reviver would fail because `"Buffer"`
isn't in the allowed constructor list and may not exist on `globalThis` in workerd.

The reducer now normalises subclass constructor names to the nearest standard
typed array parent before serialization, matching structured clone behaviour.
