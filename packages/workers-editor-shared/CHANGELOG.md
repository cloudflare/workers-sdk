# @cloudflare/workers-editor-shared

## 0.1.2

### Patch Changes

- [#14112](https://github.com/cloudflare/workers-sdk/pull/14112) [`3a746ac`](https://github.com/cloudflare/workers-sdk/commit/3a746ac56a40b805e38f26ef5328e44917b543e6) Thanks [@penalosa](https://github.com/penalosa)! - Pin non-bundled runtime dependencies to exact versions

  Dependencies that are not bundled into a package's published output are installed directly into consumers' dependency trees, so they are now pinned to exact versions instead of semver ranges. This closes a supply-chain gap where an unpinned external dependency could resolve to a compromised upstream release on a fresh install. A new `pnpm check:pinned-deps` lint enforces this for all published packages (and for the shared pnpm catalog) going forward.

## 0.1.1

### Patch Changes

- [#6731](https://github.com/cloudflare/workers-sdk/pull/6731) [`7c95836`](https://github.com/cloudflare/workers-sdk/commit/7c9583695c61903838d62023402df3f9fc36f7cb) Thanks [@WalshyDev](https://github.com/WalshyDev)! - chore: add readOnly property to WorkerLoaded event allowing us to put the editor into a read only state when loading a Worker.

## 0.1.0

### Minor Changes

- [#6446](https://github.com/cloudflare/workers-sdk/pull/6446) [`d2b7482`](https://github.com/cloudflare/workers-sdk/commit/d2b7482cb87606b4bfa068fed9204cebc0cb7213) Thanks [@penalosa](https://github.com/penalosa)! - feat: Publish shared utilities for the online editing experience
