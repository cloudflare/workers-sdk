# @cloudflare/quick-edit

## 0.0.2

### Patch Changes

- [#6558](https://github.com/cloudflare/workers-sdk/pull/6558) [`2a5b648`](https://github.com/cloudflare/workers-sdk/commit/2a5b64815455a324dd57cdcf98abbcc3f7156c98) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: disable autosave on quick editor to avoid context reset without explicit user action

## 0.0.1

### Patch Changes

- [#6029](https://github.com/cloudflare/workers-sdk/pull/6029) [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize some dependencies in workers-sdk

  This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).
