// Whilst `esbuild` includes support for transforming `using` and `await using`
// syntax, it doesn't polyfill missing built-in `Symbol`s. These aren't defined
// by the version of V8 `workerd` uses at the moment, so polyfill them if
// they're not set.
Symbol.dispose ??= Symbol("Symbol.dispose");
Symbol.asyncDispose ??= Symbol("Symbol.asyncDispose");
