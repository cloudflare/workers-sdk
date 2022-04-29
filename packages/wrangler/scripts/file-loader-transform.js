/**
 * A jest transform that returns the path to the resolved file as its only export.
 *
 * This transform is a partner to the esbuild "file" loader, which does the same at build time.
 * We use the "file" loader when we have a asset that we wish to load at runtime.
 * The loader will ensure that the file is copied into the distributable directory and then the
 * path to this new file is returned from the `import` (or `require()` call).
 *
 * Since this esbuild "file" loader does not work in the esbuild-jest transform (since it runs in memory),
 * this transform is used to ensure that the correct path is returned as the contents of the imported/required
 * file, so that the behaviour works as expected in Jest tests.
 *
 * The Jest config, in package.json, has a section like the following:
 *
 * ```json
 * "transform": {
 *   "\\.template\\.[jt]s(on)?$": [
 *     "./scripts/file-loader-transform"
 *   ],
 *   "^.+\\.c?(t|j)sx?$": [
 *     "esbuild-jest",
 *     {
 *       "sourcemap": true
 *     }
 *   ]
 * },
 * ```
 *
 * And the esbuild config, in scripts/build.ts has a section like the following:
 *
 * ```ts
 * loader: {
 *   ".template.js": "file",
 *   ".template.ts": "file",
 *   ".template.json": "file",
 * },
 * ```
 *
 * To use such a runtime file in the source code add a `require()` statement that will return the path to the file.
 * The path passed to the `require()` call should be relative to source file containing the call.
 * The return value of the `require()` call will be the path to the runtime file.
 * For example:
 *
 * ```ts
 * // eslint-disable-next-line @typescript-eslint/no-var-requires
 * const templatePluginPath = require("./plugin.template.ts");
 * ```
 */
module.exports = {
  process(_src, filename) {
    if (filename.endsWith(".json")) {
      // Jest tries to parse JSON files so we cannot return a JS module.
      return `${JSON.stringify(filename)}`;
    } else {
      return `module.exports = ${JSON.stringify(filename)};`;
    }
  },
};
