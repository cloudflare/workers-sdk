// as per https://github.com/evanw/esbuild/issues/1492
// `import.meta.url` is not available in esbuild's CJS output, so it is stubbed
// to `{}` (making `import.meta.url` `undefined`). Bundled ESM dependencies that
// use `import.meta.url` at module scope (e.g. `createRequire(import.meta.url)`
// shims emitted by tsdown/rolldown) then throw on load. Inject a valid
// file URL for the current module so those dependencies work.
export const import_meta_url = require("url").pathToFileURL(__filename);
