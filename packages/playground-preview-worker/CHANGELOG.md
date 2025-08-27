# playground-preview-worker

## 0.1.6

### Patch Changes

- [#10424](https://github.com/cloudflare/workers-sdk/pull/10424) [`c4fd176`](https://github.com/cloudflare/workers-sdk/commit/c4fd176a9caec0b24da258adb48f4a76f37bd9c7) Thanks [@penalosa](https://github.com/penalosa)! - Remove the `--experimental-json-config`/`-j` flag, which is no longer required.

## 0.1.5

### Patch Changes

- [#9649](https://github.com/cloudflare/workers-sdk/pull/9649) [`ec9b417`](https://github.com/cloudflare/workers-sdk/commit/ec9b417f8ed711e7b5044410e83d781f123a6a62) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - patch release to trigger a test release

## 0.1.4

### Patch Changes

- [#8114](https://github.com/cloudflare/workers-sdk/pull/8114) [`0322d08`](https://github.com/cloudflare/workers-sdk/commit/0322d085f634c1a0a12a59b4db293088d0cadb62) Thanks [@penalosa](https://github.com/penalosa)! - Upgrade to Hono v4

## 0.1.3

### Patch Changes

- [#7793](https://github.com/cloudflare/workers-sdk/pull/7793) [`9941219`](https://github.com/cloudflare/workers-sdk/commit/994121908de7b0537c06ed4f6bae6cb35d32521d) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: ensure no body is passed when constructing a GET or HEAD request to the preview worker

## 0.1.2

### Patch Changes

- [#7630](https://github.com/cloudflare/workers-sdk/pull/7630) [`b687dff`](https://github.com/cloudflare/workers-sdk/commit/b687dffa7cf9f77e553f475d6a400c3560a360e9) Thanks [@edmundhung](https://github.com/edmundhung)! - fix OPTIONS raw http request support by overriding raw request method with the X-CF-Http-Method header

## 0.1.1

### Patch Changes

- [#7143](https://github.com/cloudflare/workers-sdk/pull/7143) [`4d7ce6f`](https://github.com/cloudflare/workers-sdk/commit/4d7ce6fd9fc80a0920a97dae14726c79012337b1) Thanks [@emily-shen](https://github.com/emily-shen)! - chore: enable observability on our internal infra Workers + bots

## 0.1.0

### Minor Changes

- [#6458](https://github.com/cloudflare/workers-sdk/pull/6458) [`50a60a6`](https://github.com/cloudflare/workers-sdk/commit/50a60a69ee66499759d2f04459c1d182689efa64) Thanks [@penalosa](https://github.com/penalosa)! - feat: Optionally strip `cf-ew-raw-` prefix from headers before passing to the user worker

## 0.0.4

### Patch Changes

- [#6029](https://github.com/cloudflare/workers-sdk/pull/6029) [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize some dependencies in workers-sdk

  This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).

- [#6046](https://github.com/cloudflare/workers-sdk/pull/6046) [`c643a81`](https://github.com/cloudflare/workers-sdk/commit/c643a8193a3c0739b33d3c0072ae716bc8f1565b) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more dependencies.

  Follow up to https://github.com/cloudflare/workers-sdk/pull/6029, this normalizes some more dependencies : `get-port`, `chalk`, `yargs`, `toucan-js`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `esbuild-register`, `hono`, `glob-to-regexp`, `@cloudflare/workers-types`

## 0.0.3

### Patch Changes

- [#5838](https://github.com/cloudflare/workers-sdk/pull/5838) [`609debd`](https://github.com/cloudflare/workers-sdk/commit/609debdf744569278a050070846e420ffbfac161) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: update undici to the latest version to avoid a potential vulnerability

## 0.0.2

### Patch Changes

- [#5043](https://github.com/cloudflare/workers-sdk/pull/5043) [`9b1a186`](https://github.com/cloudflare/workers-sdk/commit/9b1a18609753bf0ac87dc4ba3bd3c8d3600c4517) Thanks [@penalosa](https://github.com/penalosa)! - feat: Python playground support

- [#5100](https://github.com/cloudflare/workers-sdk/pull/5100) [`2713977`](https://github.com/cloudflare/workers-sdk/commit/27139771cc5463da42df78c7f560a6004aac5db1) Thanks [@penalosa](https://github.com/penalosa)! - fix: Handle multiple set cookie headers

## 0.0.1

### Patch Changes

- [#4768](https://github.com/cloudflare/workers-sdk/pull/4768) [`c3e410c2`](https://github.com/cloudflare/workers-sdk/commit/c3e410c2797f5c59b9ea0f63c20feef643366df2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: bump undici versions to 5.28.2
