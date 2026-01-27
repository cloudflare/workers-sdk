# @cloudflare/eslint-config-shared

## 1.2.0

### Minor Changes

- [#11902](https://github.com/cloudflare/workers-sdk/pull/11902) [`2aa769c`](https://github.com/cloudflare/workers-sdk/commit/2aa769c8730a0ef99f315f9a1dd5d25d52c51974) Thanks [@emily-shen](https://github.com/emily-shen)! - Add a custom eslint rule that checks for unsafe command execution

## 1.1.0

### Minor Changes

- [#4139](https://github.com/cloudflare/workers-sdk/pull/4139) [`884e4188`](https://github.com/cloudflare/workers-sdk/commit/884e41881687c34957bf22f97fb12a127707aef9) Thanks [@1000hz](https://github.com/1000hz)! - `import/order` rule has been removed.

## 1.0.0

### Major Changes

- [#3833](https://github.com/cloudflare/workers-sdk/pull/3833) [`c2f1b689`](https://github.com/cloudflare/workers-sdk/commit/c2f1b6897ad6ccdb2d5fe8fc24fa5ea645723bf1) Thanks [@1000hz](https://github.com/1000hz)! - Updated `import/order` and `unused-imports/no-unused-vars` to raise errors.

  This change updates all rules currently raising warnings to instead raise errors. Our lint philosophy should not allow problems to be merged without being explicitly ignored.
