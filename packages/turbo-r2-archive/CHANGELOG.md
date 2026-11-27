# turbo-r2-archive

## 0.0.6

### Patch Changes

- [#16490](https://github.com/cloudflare/workers-sdk/pull/16490) [`bcd618d`](https://github.com/cloudflare/workers-sdk/commit/bcd618d0e622a020fd2cb658df0620a5e3ec2206) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Update Zod to 4.6.6 to address GHSA-mrhx-c7xc-m3w5

  The updated shared dependency fixes excessive memory consumption when validating oversized collections. This updates both the published Zod dependencies and the copies bundled into development tools and Workers.

## 0.0.5

### Patch Changes

- [#14707](https://github.com/cloudflare/workers-sdk/pull/14707) [`b38f494`](https://github.com/cloudflare/workers-sdk/commit/b38f494204e5e08e561b8f198ef928188e554868) Thanks [@emily-shen](https://github.com/emily-shen)! - Update zod to v4

## 0.0.4

### Patch Changes

- [#10424](https://github.com/cloudflare/workers-sdk/pull/10424) [`c4fd176`](https://github.com/cloudflare/workers-sdk/commit/c4fd176a9caec0b24da258adb48f4a76f37bd9c7) Thanks [@penalosa](https://github.com/penalosa)! - Remove the `--experimental-json-config`/`-j` flag, which is no longer required.

## 0.0.3

### Patch Changes

- [#9649](https://github.com/cloudflare/workers-sdk/pull/9649) [`ec9b417`](https://github.com/cloudflare/workers-sdk/commit/ec9b417f8ed711e7b5044410e83d781f123a6a62) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - patch release to trigger a test release

## 0.0.2

### Patch Changes

- [#8114](https://github.com/cloudflare/workers-sdk/pull/8114) [`0322d08`](https://github.com/cloudflare/workers-sdk/commit/0322d085f634c1a0a12a59b4db293088d0cadb62) Thanks [@penalosa](https://github.com/penalosa)! - Upgrade to Hono v4

## 0.0.1

### Patch Changes

- [#6046](https://github.com/cloudflare/workers-sdk/pull/6046) [`c643a81`](https://github.com/cloudflare/workers-sdk/commit/c643a8193a3c0739b33d3c0072ae716bc8f1565b) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more dependencies.

  Follow up to https://github.com/cloudflare/workers-sdk/pull/6029, this normalizes some more dependencies : `get-port`, `chalk`, `yargs`, `toucan-js`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `esbuild-register`, `hono`, `glob-to-regexp`, `@cloudflare/workers-types`
