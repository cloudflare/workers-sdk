# @cloudflare/eslint-config-worker

## 1.0.0

### Major Changes

- [#3833](https://github.com/cloudflare/workers-sdk/pull/3833) [`c2f1b689`](https://github.com/cloudflare/workers-sdk/commit/c2f1b6897ad6ccdb2d5fe8fc24fa5ea645723bf1) Thanks [@1000hz](https://github.com/1000hz)! - Updated `import/order` and `unused-imports/no-unused-vars` to raise errors.

  This change updates all rules currently raising warnings to instead raise errors. Our lint philosophy should not allow problems to be merged without being explicitly ignored.
