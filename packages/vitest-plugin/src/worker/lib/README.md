# Workers Polyfills

This directory contains polyfills for modules unsupported by `workerd`, but
required by Vitest. Files in this directory map directly to imports inside
`workerd` (see [`../../pool/module-fallback.ts`](../../pool/module-fallback.ts)).
For example, `lib/cloudflare/test.ts` becomes `cloudflare:test`.

Files ending in `.ts` will be bundled into ES modules, meaning they can only be
`import`ed. Files ending in `.cts` will be bundled into CommonJS modules,
meaning they can be `import`ed and `require()`ed from other CommonJS modules.
Note our implementation of the module fallback service applies Node's ESM-CJS
named-exports interop meaning named-exports in `.cts` files can still be
imported as such in ES modules.
