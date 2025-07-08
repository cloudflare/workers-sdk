# @cloudflare/containers-shared

## 0.2.3

### Patch Changes

- [#9872](https://github.com/cloudflare/workers-sdk/pull/9872) [`a727db3`](https://github.com/cloudflare/workers-sdk/commit/a727db341a811572623e0a0f361f070a95758776) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: resolve Dockerfile path relative to the Wrangler config path

  This fixes a bug where Wrangler would not be able to find a Dockerfile if a Wrangler config path had been specified with the `--config` flag.

## 0.2.2

### Patch Changes

- [#9718](https://github.com/cloudflare/workers-sdk/pull/9718) [`fb83341`](https://github.com/cloudflare/workers-sdk/commit/fb83341bed6ff6571519eb117db19e3e76a83215) Thanks [@mhart](https://github.com/mhart)! - fix error message when docker daemon is not running

## 0.2.1

### Patch Changes

- [#9596](https://github.com/cloudflare/workers-sdk/pull/9596) [`5162c51`](https://github.com/cloudflare/workers-sdk/commit/5162c5194604f26b2e5018961b761f3450872333) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - add ability to pull images for containers local dev

## 0.2.0

### Minor Changes

- [#9675](https://github.com/cloudflare/workers-sdk/pull/9675) [`caf97e4`](https://github.com/cloudflare/workers-sdk/commit/caf97e40e5c9d765dcf0bd716cd81d986c496bdc) Thanks [@emily-shen](https://github.com/emily-shen)! - `containers-shared` contains shared code relating to containers that is used across `workers-sdk`.

### Patch Changes

- [#9653](https://github.com/cloudflare/workers-sdk/pull/9653) [`8a60fe7`](https://github.com/cloudflare/workers-sdk/commit/8a60fe76ec5ecc734c0eb9f31b4d60e86d5cb06d) Thanks [@penalosa](https://github.com/penalosa)! - Rename `WRANGLER_CONTAINERS_DOCKER_PATH` to `WRANGLER_DOCKER_BIN`

- [#9653](https://github.com/cloudflare/workers-sdk/pull/9653) [`8a60fe7`](https://github.com/cloudflare/workers-sdk/commit/8a60fe76ec5ecc734c0eb9f31b4d60e86d5cb06d) Thanks [@penalosa](https://github.com/penalosa)! - Add a warning banner to `wrangler cloudchamber` and `wrangler containers` commands

- [#9605](https://github.com/cloudflare/workers-sdk/pull/9605) [`17d23d8`](https://github.com/cloudflare/workers-sdk/commit/17d23d8e5fd54737d1c4b9cb487fd6e85cddc9c8) Thanks [@emily-shen](https://github.com/emily-shen)! - Add rebuild hotkey for containers local dev, and clean up containers at the end of a dev session.
