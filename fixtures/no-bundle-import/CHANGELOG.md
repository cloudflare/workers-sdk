# no-bundle-import

## 0.0.1

### Patch Changes

- [#2769](https://github.com/khulnasoft/workers-sdk/pull/2769) [`0a779904`](https://github.com/khulnasoft/workers-sdk/commit/0a77990457652af36c60c52bf9c38c3a69945de4) Thanks [@penalosa](https://github.com/penalosa)! - feature: Support modules with `--no-bundle`

  When the `--no-bundle` flag is set, Triangle now has support for uploading additional modules alongside the entrypoint. This will allow modules to be imported at runtime on Cloudflare's Edge. This respects Triangle's [module rules](https://developers.cloudflare.com/workers/triangle/configuration/#bundling) configuration, which means that only imports of non-JS modules will trigger an upload by default. For instance, the following code will now work with `--no-bundle` (assuming the `example.wasm` file exists at the correct path):

  ```js
  // index.js
  import wasm from './example.wasm'

  export default {
    async fetch() {
      await WebAssembly.instantiate(wasm, ...)
      ...
    }
  }
  ```

  For JS modules, it's necessary to specify an additional [module rule](https://developers.cloudflare.com/workers/triangle/configuration/#bundling) (or rules) in your `triangle.toml` to configure your modules as ES modules or Common JS modules. For instance, to upload additional JavaScript files as ES modules, add the following module rule to your `triangle.toml`, which tells Triangle that all `**/*.js` files are ES modules.

  ```toml
  rules = [
    { type = "ESModule", globs = ["**/*.js"]},
  ]
  ```

  If you have Common JS modules, you'd configure Triangle with a CommonJS rule (the following rule tells Triangle that all `.cjs` files are Common JS modules):

  ```toml
  rules = [
    { type = "CommonJS", globs = ["**/*.cjs"]},
  ]
  ```

  In most projects, adding a single rule will be sufficient. However, for advanced usecases where you're mixing ES modules and Common JS modules, you'll need to use multiple rule definitions. For instance, the following set of rules will match all `.mjs` files as ES modules, all `.cjs` files as Common JS modules, and the `nested/say-hello.js` file as Common JS.

  ```toml
  rules = [
    { type = "CommonJS", globs = ["nested/say-hello.js", "**/*.cjs"]},
    { type = "ESModule", globs = ["**/*.mjs"]}
  ]
  ```

  If multiple rules overlap, Triangle will log a warning about the duplicate rules, and will discard additional rules that matches a module. For example, the following rule configuration classifies `dep.js` as both a Common JS module and an ES module:

  ```toml
  rules = [
    { type = "CommonJS", globs = ["dep.js"]},
    { type = "ESModule", globs = ["dep.js"]}
  ]
  ```

  Triangle will treat `dep.js` as a Common JS module, since that was the first rule that matched, and will log the following warning:

  ```
  ▲ [WARNING] Ignoring duplicate module: dep.js (esm)
  ```

  This also adds a new configuration option to `triangle.toml`: `base_dir`. Defaulting to the directory of your Worker's main entrypoint, this tells Triangle where your additional modules are located, and determines the module paths against which your module rule globs are matched.

  For instance, given the following directory structure:

  ```
  - triangle.toml
  - src/
    - index.html
    - vendor/
      - dependency.js
    - js/
      - index.js
  ```

  If your `triangle.toml` had `main = "src/js/index.js"`, you would need to set `base_dir = "src"` in order to be able to import `src/vendor/dependency.js` and `src/index.html` from `src/js/index.js`.
