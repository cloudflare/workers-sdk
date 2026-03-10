# workers-playground

## 0.3.0

### Minor Changes

- [#12549](https://github.com/cloudflare/workers-sdk/pull/12549) [`10e2e15`](https://github.com/cloudflare/workers-sdk/commit/10e2e15406e9721ecf89f69226de771674aa6227) Thanks [@penalosa](https://github.com/penalosa)! - Add expandable object logging and improved console UI

  The Quick Editor console now displays logged objects and arrays as expandable tree views instead of `[object Object]`.

## 0.2.6

### Patch Changes

- [#11435](https://github.com/cloudflare/workers-sdk/pull/11435) [`ccf877e`](https://github.com/cloudflare/workers-sdk/commit/ccf877ea1a45e90e5aa7162624649220730920b9) Thanks [@penalosa](https://github.com/penalosa)! - Use `tail_url` to power Workers Playground logging

## 0.2.5

### Patch Changes

- [#9886](https://github.com/cloudflare/workers-sdk/pull/9886) [`17b1e5a`](https://github.com/cloudflare/workers-sdk/commit/17b1e5af8fe54cf9ad942278d860cd88eb2a2ebd) Thanks [@dom96](https://github.com/dom96)! - Python packages are now read from cf-requirements.txt instead of requirements.txt by default

## 0.2.4

### Patch Changes

- [#8205](https://github.com/cloudflare/workers-sdk/pull/8205) [`6f26beb`](https://github.com/cloudflare/workers-sdk/commit/6f26bebb0d41786cdc10320a0f1558467c563a67) Thanks [@penalosa](https://github.com/penalosa)! - Use today's date as the default starter playground compat date

## 0.2.3

### Patch Changes

- [#7936](https://github.com/cloudflare/workers-sdk/pull/7936) [`2a59eae`](https://github.com/cloudflare/workers-sdk/commit/2a59eaeaf93d92d56cad33d91713d0e49339b1bd) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: sends raw request method through the X-CF-HTTP-Method header

## 0.2.2

### Patch Changes

- [#7791](https://github.com/cloudflare/workers-sdk/pull/7791) [`f8c11d7`](https://github.com/cloudflare/workers-sdk/commit/f8c11d7418c6feeac673c7bad909050f1b56b476) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Reverts #7639

  Seems like our prev release of the workers-playground broke things. We are seeing a spike of related errors. We are therefore reverting the changes

## 0.2.1

### Patch Changes

- [#7639](https://github.com/cloudflare/workers-sdk/pull/7639) [`99f27df`](https://github.com/cloudflare/workers-sdk/commit/99f27df059c211428d4cf3cc07bb99c164d22369) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: sends raw request method through the X-CF-HTTP-Method header

## 0.2.0

### Minor Changes

- [#6962](https://github.com/cloudflare/workers-sdk/pull/6962) [`a204747`](https://github.com/cloudflare/workers-sdk/commit/a204747e04afa7592d0cbb5d9fb35d9cd0b2cd49) Thanks [@edmundhung](https://github.com/edmundhung)! - feat: delay preview environment setup until user interaction

  The preview environment will now be set up after the user clicks the send or go button.

## 0.1.1

### Patch Changes

- Updated dependencies [[`7c95836`](https://github.com/cloudflare/workers-sdk/commit/7c9583695c61903838d62023402df3f9fc36f7cb)]:
  - @cloudflare/workers-editor-shared@0.1.1

## 0.1.0

### Minor Changes

- [#6528](https://github.com/cloudflare/workers-sdk/pull/6528) [`c3441c5`](https://github.com/cloudflare/workers-sdk/commit/c3441c544ea664badb34bbbdeda10a3fe6916085) Thanks [@penalosa](https://github.com/penalosa)! - feat: Prefix HTTP headers sent by the playground with `cf-ew-raw-`

- [#6532](https://github.com/cloudflare/workers-sdk/pull/6532) [`d80fccb`](https://github.com/cloudflare/workers-sdk/commit/d80fccbb41aec8e620194479e12d167685124f56) Thanks [@penalosa](https://github.com/penalosa)! - feat: Add Wrangler CTA to the playground

## 0.0.7

### Patch Changes

- Updated dependencies [[`d2b7482`](https://github.com/cloudflare/workers-sdk/commit/d2b7482cb87606b4bfa068fed9204cebc0cb7213)]:
  - @cloudflare/workers-editor-shared@0.1.0

## 0.0.6

### Patch Changes

- [#6029](https://github.com/cloudflare/workers-sdk/pull/6029) [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize some dependencies in workers-sdk

  This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).

- [#6046](https://github.com/cloudflare/workers-sdk/pull/6046) [`c643a81`](https://github.com/cloudflare/workers-sdk/commit/c643a8193a3c0739b33d3c0072ae716bc8f1565b) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more dependencies.

  Follow up to https://github.com/cloudflare/workers-sdk/pull/6029, this normalizes some more dependencies : `get-port`, `chalk`, `yargs`, `toucan-js`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `esbuild-register`, `hono`, `glob-to-regexp`, `@cloudflare/workers-types`

## 0.0.5

### Patch Changes

- [#5838](https://github.com/cloudflare/workers-sdk/pull/5838) [`609debd`](https://github.com/cloudflare/workers-sdk/commit/609debdf744569278a050070846e420ffbfac161) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: update undici to the latest version to avoid a potential vulnerability

## 0.0.4

### Patch Changes

- [#5482](https://github.com/cloudflare/workers-sdk/pull/5482) [`1b7739e`](https://github.com/cloudflare/workers-sdk/commit/1b7739e0af99860aa063f01c0a6e7712ac072fdb) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - docs: show new Discord url everywhere for consistency. The old URL still works, but https://discord.cloudflare.com is preferred.

## 0.0.3

### Patch Changes

- [#5473](https://github.com/cloudflare/workers-sdk/pull/5473) [`5212154`](https://github.com/cloudflare/workers-sdk/commit/52121544698d1ffb395e0984a63ab5eb91e6f05e) Thanks [@penalosa](https://github.com/penalosa)! - fix: Rename `fetch` to `on_fetch`

## 0.0.2

### Patch Changes

- [#5043](https://github.com/cloudflare/workers-sdk/pull/5043) [`9b1a186`](https://github.com/cloudflare/workers-sdk/commit/9b1a18609753bf0ac87dc4ba3bd3c8d3600c4517) Thanks [@penalosa](https://github.com/penalosa)! - feat: Python playground support

- [#5196](https://github.com/cloudflare/workers-sdk/pull/5196) [`b58ed9f`](https://github.com/cloudflare/workers-sdk/commit/b58ed9f2e7236e0e88f936bbf946f310ca3cf37f) Thanks [@penalosa](https://github.com/penalosa)! - fix: Rename `fetch` to `on_fetch`

## 0.0.1

### Patch Changes

- [#4768](https://github.com/cloudflare/workers-sdk/pull/4768) [`c3e410c2`](https://github.com/cloudflare/workers-sdk/commit/c3e410c2797f5c59b9ea0f63c20feef643366df2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: bump undici versions to 5.28.2
