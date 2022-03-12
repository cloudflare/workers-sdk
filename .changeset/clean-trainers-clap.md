---
"wrangler": patch
---

fix: consolidate `getEntry()` logic

This consolidates some logic into `getEntry()`, namely including `guessWorkerFormat()` and custom builds. This simplifies the code for both `dev` and `publish`.

- Previously, the implementation of custom builds inside `dev` assumed it could be a long running process; however it's not (else consider that `publish` would never work).
- By running custom builds inside `getEntry()`, we can be certain that the entry point exists as we validate it and before we enter `dev`/`publish`, simplifying their internals
- We don't have to do periodic checks inside `wrangler dev` because it's now a one shot build (and always should have been)
- This expands test coverage a little for both `dev` and `publish`.
- The 'format' of a worker is intrinsic to its contents, so it makes sense to establish its value inside `getEntry()`
- This also means less async logic inside `<Dev/>`, which is always a good thing
