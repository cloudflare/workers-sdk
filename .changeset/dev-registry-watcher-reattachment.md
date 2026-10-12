---
"miniflare": patch
---

Fix a leaked filesystem watcher that stopped short-lived local sessions from exiting

A Miniflare instance using shared local storage could leave a native filesystem watcher on the dev registry directory behind after `dispose()` had resolved. Chokidar's `close()` does not abandon a directory scan that is already in flight; when such a scan finished it re-entered `FSWatcher#add()`, which resets the watcher's `closed` flag and clears per-path ignores, and attached a watcher nothing could then close. The resulting handle kept the Node process alive indefinitely, so a one-shot local command — `cf d1 migrations apply --local`, for example — applied its migrations, printed its result, and then never exited.

Each watcher now carries a liveness flag that is cleared immediately before the `close()` that retires it, and an `ignored` predicate reads that flag. Chokidar re-reads the predicate whenever a re-entrant `add()` rebuilds its match list, so the late re-attachment is refused. This covers both watcher retirements: the one in `dispose()` and the one in `updateRegistryPath()`, where the registry stays usable but the watcher for the old path does not.
