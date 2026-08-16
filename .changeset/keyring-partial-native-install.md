---
"@cloudflare/workers-auth": patch
---

fix: recover from a partially installed `@napi-rs/keyring` native binding

On Windows, opting into keyring-backed credential storage lazily installs `@napi-rs/keyring`. The check for whether that binding was already present only tested that its `index.js` existed.

That is not evidence of a working install. `index.js` `require`s a platform-specific `.node` binary which arrives as a separate package, so an `npm install` that is interrupted, runs out of disk, or fails to fetch the platform package leaves `index.js` on disk with nothing loadable beside it. The result was a permanently broken keyring: the binding was reported as available, so the install was never retried, and every credential read and write instead failed with a raw module-resolution error. The verdict was also memoised per process, so it could not be shaken off.

A candidate binding is now only accepted once it has actually been loaded, which is the same thing the credential path does with it moments later. A half-installed binding is reported as absent, so it gets reinstalled and then works, rather than failing indefinitely.
