# wranglerjs-compat-webpack-plugin

## 0.0.6

### Patch Changes

- [#1691](https://github.com/cloudflare/wrangler2/pull/1691) [`5b2c3ee2`](https://github.com/cloudflare/wrangler2/commit/5b2c3ee2c5d65b25c966ca07751f544f282525b9) Thanks [@cameron-robey](https://github.com/cameron-robey)! - chore: bump undici and increase minimum node version to 16.13

  - We bump undici to version to 5.9.1 to patch some security vulnerabilities in previous versions
  - This requires bumping the minimum node version to >= 16.8 so we update the minimum to the LTS 16.13

  Fixes https://github.com/cloudflare/wrangler2/issues/1679
  Fixes https://github.com/cloudflare/wrangler2/issues/1684

## 0.0.5

### Patch Changes

- [`8529678`](https://github.com/cloudflare/wrangler2/commit/85296787adb1835054510a5df23a30ee08758971) Thanks [@threepointone](https://github.com/threepointone)! - fix: build the webpack plugin along with the others

## 0.0.4

### Patch Changes

- [`70c01a2`](https://github.com/cloudflare/wrangler2/commit/70c01a2a13b1950be07d9b02cb3f12cbc91036ad) Thanks [@threepointone](https://github.com/threepointone)! - fix: include all files when publishing wranglerjs-compat-webpack-plugin

## 0.0.3

### Patch Changes

- [`cf300ee`](https://github.com/cloudflare/wrangler2/commit/cf300eef4c6ca94386ed3cbcf19d470aa6972aca) Thanks [@threepointone](https://github.com/threepointone)! - fix: include files to be published with wranglerjs-compat-webpack-plugin

## 0.0.2

### Patch Changes

- [#1034](https://github.com/cloudflare/wrangler2/pull/1034) [`53033f3`](https://github.com/cloudflare/wrangler2/commit/53033f3091e2d8fc675a0b078b36b3aa37673cba) Thanks [@threepointone](https://github.com/threepointone)! - Bumping wranglerjs-compat-webpack-plugin to do a release

## 0.0.1

### Patch Changes

- [#759](https://github.com/cloudflare/wrangler2/pull/759) [`698f784`](https://github.com/cloudflare/wrangler2/commit/698f784ec33c574f374144c08638f21718db97a1) Thanks [@caass](https://github.com/caass)! - Create WranglerJsCompatWebpackPlugin

  A webpack@4 plugin to emulate the behavior of wrangler 1's `type=webpack` for users that cannot switch to esbuild and are not already using a custom build.
