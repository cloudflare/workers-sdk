---
"@cloudflare/vite-plugin": patch
"miniflare": minor
---

Stop a starting `vite dev` session from crashing the runtime of another local dev session

The Vite plugin brings `workerd` up twice while starting: once to discover each Worker's exports by running it, then again with a config built from what it found. The first runtime was advertised in the dev registry before being torn down, so another dev session that resolved it was left holding a debug port that no longer existed. On Windows that could abort the other session's runtime outright, taking down a Worker that had been running happily.

Registration is now held back until the runtime that Vite settles on is the one peers will actually connect to. Reading the registry is unaffected, so a starting session still reaches Workers from sessions that are already running.

This adds two Miniflare APIs for consumers that bring their runtime up in more than one step: the `unsafeDeferDevRegistryRegistration` option, and `unsafeRegisterInDevRegistry()` to release the hold once the final runtime is ready.
