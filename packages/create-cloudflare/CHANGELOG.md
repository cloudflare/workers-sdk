# create-cloudflare

## 2.10.0

### Minor Changes

- [#4754](https://github.com/cloudflare/workers-sdk/pull/4754) [`06f85613`](https://github.com/cloudflare/workers-sdk/commit/06f85613228066ccb323c2818b443e9460b02c94) Thanks [@jculvey](https://github.com/jculvey)! - Adds C3 support for external templates hosted in git repositories via the `--template <source>` option.

  The source may be specified as any of the following:

  - `user/repo`
  - `git@github.com:user/repo`
  - `https://github.com/user/repo`
  - `user/repo/some-template` (subdirectories)
  - `user/repo#canary` (branches)
  - `user/repo#1234abcd` (commit hash)
  - `bitbucket:user/repo` (BitBucket)
  - `gitlab:user/repo` (GitLab)

  See the `degit` [docs](https://github.com/Rich-Harris/degit) for more details.

  At a minimum, templates must contain the following:

  - `package.json`
  - `wrangler.toml`
  - `src/` containing a worker script referenced from `wrangler.toml`

  See the [templates folder](https://github.com/cloudflare/workers-sdk/tree/main/templates) of this repo for more examples.

### Patch Changes

- [#4828](https://github.com/cloudflare/workers-sdk/pull/4828) [`99bf5f86`](https://github.com/cloudflare/workers-sdk/commit/99bf5f8653bd026555cceffa61ee9120eb2c4645) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.13.1` to `5.13.2`

* [#4836](https://github.com/cloudflare/workers-sdk/pull/4836) [`6d7d00a8`](https://github.com/cloudflare/workers-sdk/commit/6d7d00a835152fc241781fdca8eda41a00f53a40) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `@angular/create` from `17.1.0` to `17.1.1`

- [#4842](https://github.com/cloudflare/workers-sdk/pull/4842) [`9fb39e63`](https://github.com/cloudflare/workers-sdk/commit/9fb39e63506bdd28f29cf387543978ebf85263cd) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.4.0` to `1.4.1`

* [#4843](https://github.com/cloudflare/workers-sdk/pull/4843) [`b3c5566c`](https://github.com/cloudflare/workers-sdk/commit/b3c5566c0988c0cdd4e285bfe5792baa4127af94) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.13.2` to `5.13.3`

- [#4834](https://github.com/cloudflare/workers-sdk/pull/4834) [`0123eef1`](https://github.com/cloudflare/workers-sdk/commit/0123eef14a071492354f46fb212d78f793e1bb14) Thanks [@jculvey](https://github.com/jculvey)! - Fixed an issue where commands were sometimes formatted with un-needed escape characters (ex. 'pages:\dev')

* [#4754](https://github.com/cloudflare/workers-sdk/pull/4754) [`06f85613`](https://github.com/cloudflare/workers-sdk/commit/06f85613228066ccb323c2818b443e9460b02c94) Thanks [@jculvey](https://github.com/jculvey)! - C3: Fix a bug where the "Pre-existing Worker (from Dashboard)" option was hidden in the dialog but still selectable

- [#4711](https://github.com/cloudflare/workers-sdk/pull/4711) [`fa91ff54`](https://github.com/cloudflare/workers-sdk/commit/fa91ff546ceb30207245518d4b38e6a416de9ed3) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - update the solidStart logic to work with their latest (beta-2) implementation

* [#4771](https://github.com/cloudflare/workers-sdk/pull/4771) [`f4f38fc7`](https://github.com/cloudflare/workers-sdk/commit/f4f38fc7d58347b7e69eab013685798d90bb633a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: correctly find the latest version of create-cloudflare

  When create-cloudflare starts up, it checks to see if the version being run
  is the latest available on npm.

  Previously this check used `npm info` to look up the version.
  But was prone to failing if that command returned additional unexpected output
  such as warnings.

  Now we make a fetch request to the npm REST API directly for the latest version,
  which does not have the problem of unexpected warnings.

  Since the same approach is used to compute the latest version of workerd, the
  function to do this has been put into a helper.

  Fixes #4729

## 2.9.3

### Patch Changes

- [#4780](https://github.com/cloudflare/workers-sdk/pull/4780) [`a75ef752`](https://github.com/cloudflare/workers-sdk/commit/a75ef752fc444abff67efd77559cb0fa3c527a88) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `@angular/create` from `17.0.6` to `17.1.0`

* [#4786](https://github.com/cloudflare/workers-sdk/pull/4786) [`7273efca`](https://github.com/cloudflare/workers-sdk/commit/7273efca019900f0514ab111bf71fd8025c6daae) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `6.0.6` to `6.0.8`

- [#4788](https://github.com/cloudflare/workers-sdk/pull/4788) [`d4676266`](https://github.com/cloudflare/workers-sdk/commit/d46762667b08f398e7ce04c2a32e7628966f5086) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.5.0` to `2.5.1`

* [#4789](https://github.com/cloudflare/workers-sdk/pull/4789) [`475da3a6`](https://github.com/cloudflare/workers-sdk/commit/475da3a60e2e396e56c9a3bd43290ac83c1bbef5) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.3.5` to `1.4.0`

- [#4803](https://github.com/cloudflare/workers-sdk/pull/4803) [`fa09f4a2`](https://github.com/cloudflare/workers-sdk/commit/fa09f4a2e421e402bf0f82f24b5c884c90c667ff) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feat: add "Hello World" example for Durable Objects

  This new starter corresponds to the getting started guide in the docs.

  See #4747

* [#4768](https://github.com/cloudflare/workers-sdk/pull/4768) [`c3e410c2`](https://github.com/cloudflare/workers-sdk/commit/c3e410c2797f5c59b9ea0f63c20feef643366df2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: bump undici versions to 5.28.2

## 2.9.2

### Patch Changes

- [#4717](https://github.com/cloudflare/workers-sdk/pull/4717) [`05e3b544`](https://github.com/cloudflare/workers-sdk/commit/05e3b5446390c41c9e1846714e4f6020ca34c490) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-docusaurus` from `3.0.1` to `3.1.0`

* [#4728](https://github.com/cloudflare/workers-sdk/pull/4728) [`38d656b0`](https://github.com/cloudflare/workers-sdk/commit/38d656b0108453ef9fafee6108c145a0abbcf95e) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `6.0.5` to `6.0.6`

- [#4769](https://github.com/cloudflare/workers-sdk/pull/4769) [`fd1e9aa9`](https://github.com/cloudflare/workers-sdk/commit/fd1e9aa96cc44308f2e1e6213b4da57ff9b53f10) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.3.2` to `1.3.5`

* [#4770](https://github.com/cloudflare/workers-sdk/pull/4770) [`f2bfa5e2`](https://github.com/cloudflare/workers-sdk/commit/f2bfa5e26a1f0e61f81ee699f04fa7ab88c1e315) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.4.1` to `2.5.0`

- [#4776](https://github.com/cloudflare/workers-sdk/pull/4776) [`eefd232e`](https://github.com/cloudflare/workers-sdk/commit/eefd232efbfb3c57b8f03d205ae1831ee1a3f536) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.6.0` to `4.7.1`

## 2.9.1

### Patch Changes

- [`4667e0ed`](https://github.com/cloudflare/workers-sdk/commit/4667e0ed20078939b8abdd49c4ff1015f828de84) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: Update Next.js template to support bindings for dev server

## 2.9.0

### Minor Changes

- [#4625](https://github.com/cloudflare/workers-sdk/pull/4625) [`e8053554`](https://github.com/cloudflare/workers-sdk/commit/e8053554e04cde99d874377b92bd83af6f9e9ee8) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Create a custom not-found edge route for Next.js applications using the app router

### Patch Changes

- [#4690](https://github.com/cloudflare/workers-sdk/pull/4690) [`9e032723`](https://github.com/cloudflare/workers-sdk/commit/9e0327232b339df803abe62690c66e11f6576fac) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.12.12` to `5.13.1`

## 2.8.5

### Patch Changes

- [#4617](https://github.com/cloudflare/workers-sdk/pull/4617) [`45972200`](https://github.com/cloudflare/workers-sdk/commit/45972200e571bc48693fb678114c64827f15c4d4) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-vue` from `3.9.0` to `3.9.1`

* [#4618](https://github.com/cloudflare/workers-sdk/pull/4618) [`10e267fc`](https://github.com/cloudflare/workers-sdk/commit/10e267fce70b45ae37070a5393a52cd9851de85b) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.5.2` to `4.6.0`

- [#4679](https://github.com/cloudflare/workers-sdk/pull/4679) [`873d7dd6`](https://github.com/cloudflare/workers-sdk/commit/873d7dd6ec02e58d64838cc0389201af4232ca3e) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.3.1` to `1.3.2`

* [#4680](https://github.com/cloudflare/workers-sdk/pull/4680) [`ba298d08`](https://github.com/cloudflare/workers-sdk/commit/ba298d085c8e5c69cc8d944160fa7487d969b953) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.4.0` to `2.4.1`

- [#4681](https://github.com/cloudflare/workers-sdk/pull/4681) [`6fb72f8b`](https://github.com/cloudflare/workers-sdk/commit/6fb72f8bd0be07b66d3226b3ba5d7d44cb841104) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `6.0.3` to `6.0.5`

* [#4627](https://github.com/cloudflare/workers-sdk/pull/4627) [`44cbd66f`](https://github.com/cloudflare/workers-sdk/commit/44cbd66ff2283384569756ef578b08ec1556cdb8) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - make the workerd compatibility date retrieval more stable by fetching it directly from the npm registry

## 2.8.4

### Patch Changes

- [#4616](https://github.com/cloudflare/workers-sdk/pull/4616) [`e2205e35`](https://github.com/cloudflare/workers-sdk/commit/e2205e354ed9c142c7bbaaed1d4457893ceec8ce) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.3.0` to `1.3.1`

* [#4626](https://github.com/cloudflare/workers-sdk/pull/4626) [`421cd584`](https://github.com/cloudflare/workers-sdk/commit/421cd584a678a97de2f24e1c1b28a766f984148e) Thanks [@jculvey](https://github.com/jculvey)! - C3: Bumped `create-svelte` from `5.3.3` to `6.0.3`

## 2.8.3

### Patch Changes

- [#4603](https://github.com/cloudflare/workers-sdk/pull/4603) [`6db2c2a8`](https://github.com/cloudflare/workers-sdk/commit/6db2c2a816b1140951f5fe6a8618312d83a62d44) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.3.1` to `2.4.0`

* [#4598](https://github.com/cloudflare/workers-sdk/pull/4598) [`ffa01a7d`](https://github.com/cloudflare/workers-sdk/commit/ffa01a7d9df25d3ac31e18498659762d67e234f7) Thanks [@penalosa](https://github.com/penalosa)! - fix: Ensure C3 can be used to create TypeScript workers

- [#4594](https://github.com/cloudflare/workers-sdk/pull/4594) [`850c4d64`](https://github.com/cloudflare/workers-sdk/commit/850c4d64a517329be2ec7fdffef26d3bbd77e9b0) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - amend broken cd instruction

## 2.8.2

### Patch Changes

- [#4556](https://github.com/cloudflare/workers-sdk/pull/4556) [`dcd3c582`](https://github.com/cloudflare/workers-sdk/commit/dcd3c582f69fb948b13ce3dfe0406362c069422e) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-vue` from `3.8.0` to `3.9.0`

* [#4557](https://github.com/cloudflare/workers-sdk/pull/4557) [`1a3e3ba4`](https://github.com/cloudflare/workers-sdk/commit/1a3e3ba434c6254d6bd86045c789315c2a3c461b) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `5.3.2` to `5.3.3`

- [#4558](https://github.com/cloudflare/workers-sdk/pull/4558) [`ef03dc74`](https://github.com/cloudflare/workers-sdk/commit/ef03dc741c15c975940eef7bdd4be0b9d1d9737a) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.5.1` to `4.5.2`

* [#4564](https://github.com/cloudflare/workers-sdk/pull/4564) [`d99bd421`](https://github.com/cloudflare/workers-sdk/commit/d99bd4214c626794f018c70f43eeac92277a41f3) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `@angular/create` from `17.0.5` to `17.0.6`

- [#4565](https://github.com/cloudflare/workers-sdk/pull/4565) [`be9a296d`](https://github.com/cloudflare/workers-sdk/commit/be9a296db10ac46e4d56367c89647791858ef500) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.19` to `1.3.0`

* [#4572](https://github.com/cloudflare/workers-sdk/pull/4572) [`39d77323`](https://github.com/cloudflare/workers-sdk/commit/39d77323932c28641011169836213950e3a8ebc6) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.12.11` to `5.12.12`

- [#4575](https://github.com/cloudflare/workers-sdk/pull/4575) [`bb116f60`](https://github.com/cloudflare/workers-sdk/commit/bb116f60b322881f352ff2bd173feb722bdf87ea) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-next-app` from `14.0.3` to `14.0.4`

* [#4579](https://github.com/cloudflare/workers-sdk/pull/4579) [`cccd56b8`](https://github.com/cloudflare/workers-sdk/commit/cccd56b83aa5eed4b1f0d0c171e47ef2db7d9861) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Don't show `cd` instructions when the user is creating a project in the current directory

## 2.8.1

### Patch Changes

- [#4538](https://github.com/cloudflare/workers-sdk/pull/4538) [`a72f64c8`](https://github.com/cloudflare/workers-sdk/commit/a72f64c81c549510535fdc955bd3ad550be6c5a6) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-docusaurus` from `3.0.0` to `3.0.1`

## 2.8.0

### Minor Changes

- [#4494](https://github.com/cloudflare/workers-sdk/pull/4494) [`9bea4e32`](https://github.com/cloudflare/workers-sdk/commit/9bea4e32c6da9217c9a50e498f15ba49446131e1) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Change the default project type to the hello world worker script.

* [#4525](https://github.com/cloudflare/workers-sdk/pull/4525) [`294ca542`](https://github.com/cloudflare/workers-sdk/commit/294ca542c6ad57685b97fd787bfc3fe47c3cae74) Thanks [@jculvey](https://github.com/jculvey)! - C3: Use latest version of `wrangler` and `@cloudflare/workers-types`.

  Also updates the `types` entry of the project's `tsconfig.json` to use type definitions corresponding to the latest compatibility date.

### Patch Changes

- [#4445](https://github.com/cloudflare/workers-sdk/pull/4445) [`652cc422`](https://github.com/cloudflare/workers-sdk/commit/652cc4222e28cb303c330c5264874b2ba2810dac) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure shell scripts work on Windows

  Our use of `shell-quote` was causing problems on Windows where it was
  escaping character (such as `@`) by placing a backslash in front.
  This made Windows think that such path arguments, were at the root.

  For example, `npm install -D @cloudflare/workers-types` was being converted to
  `npm install -D \@cloudflare/workers-types`, which resulted in errors like:

  ```
  npm ERR! enoent ENOENT: no such file or directory, open 'D:\@cloudflare\workers-types\package.json'
  ```

  Now we just rely directly on the Node.js `spawn` API to avoid any shell quoting
  concerns. This has resulted in a slightly less streamlined experience for people
  writing C3 plugins, but has the benefit that the developer doesn't have to worry
  about quoting spawn arguments.

  Closes https://github.com/cloudflare/workers-sdk/issues/4282

* [#4432](https://github.com/cloudflare/workers-sdk/pull/4432) [`04a2d0ed`](https://github.com/cloudflare/workers-sdk/commit/04a2d0ed6fca1c366cd891b54026c34e1c1a5701) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-solid` from `0.3.9` to `0.3.10`

- [#4465](https://github.com/cloudflare/workers-sdk/pull/4465) [`d79a68fd`](https://github.com/cloudflare/workers-sdk/commit/d79a68fd463e9de973ee87b0ed9566a936f24220) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `5.2.0` to `5.3.1`

* [#4472](https://github.com/cloudflare/workers-sdk/pull/4472) [`beed1575`](https://github.com/cloudflare/workers-sdk/commit/beed157532301dfc637f354a8d2814bc0544e7a3) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `nuxi` from `3.9.1` to `3.10.0`

- [#4491](https://github.com/cloudflare/workers-sdk/pull/4491) [`e6ddf8a7`](https://github.com/cloudflare/workers-sdk/commit/e6ddf8a71b11419bc46dbdddda748ef9fe84116c) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.17` to `1.2.19`

* [#4504](https://github.com/cloudflare/workers-sdk/pull/4504) [`3b5407a9`](https://github.com/cloudflare/workers-sdk/commit/3b5407a968189e60974233c5db8615162db37fd2) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `@angular/create` from `17.0.1` to `17.0.3`

- [#4506](https://github.com/cloudflare/workers-sdk/pull/4506) [`d8b5a01e`](https://github.com/cloudflare/workers-sdk/commit/d8b5a01e2b7be4a52de22989aec35cad580f9fb2) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.12.9` to `5.12.11`

* [#4507](https://github.com/cloudflare/workers-sdk/pull/4507) [`743d15fe`](https://github.com/cloudflare/workers-sdk/commit/743d15fe76b6330f439e74596a7cadecc0bf85d2) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.2.0` to `2.3.1`

- [#4508](https://github.com/cloudflare/workers-sdk/pull/4508) [`743df0af`](https://github.com/cloudflare/workers-sdk/commit/743df0af21cf2f8763be9403f3f00e6ecd47cef6) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `5.3.1` to `5.3.2`

* [#4530](https://github.com/cloudflare/workers-sdk/pull/4530) [`774b16c9`](https://github.com/cloudflare/workers-sdk/commit/774b16c9138bbe7e7d42a8a27048755191010167) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `@angular/create` from `17.0.3` to `17.0.5`

- [#4481](https://github.com/cloudflare/workers-sdk/pull/4481) [`18a4dd92`](https://github.com/cloudflare/workers-sdk/commit/18a4dd92456f955ccbb35567a88475beafda01c0) Thanks [@jculvey](https://github.com/jculvey)! - Minor improvements when using the `--existing-script scriptName` flag:

  - Format the type as "Pre-existing Worker (from Dashboard)"
  - Defaults the project name to `scriptName`

* [#4445](https://github.com/cloudflare/workers-sdk/pull/4445) [`652cc422`](https://github.com/cloudflare/workers-sdk/commit/652cc4222e28cb303c330c5264874b2ba2810dac) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: update Nuxt template to work on Windows

  Rather than relying upon the non-Windows shell syntax to specify an environment variable,
  we now update the `nuxt.config.ts` files to include the cloudflare preset.

  Fixes #4285

- [#4520](https://github.com/cloudflare/workers-sdk/pull/4520) [`1b945a07`](https://github.com/cloudflare/workers-sdk/commit/1b945a07bd5e7e299a955ea23e6c6e335bd8ba0a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure Angular alter-polyfill script works on Windows

## 2.7.1

### Patch Changes

- [#4441](https://github.com/cloudflare/workers-sdk/pull/4441) [`01d34f21`](https://github.com/cloudflare/workers-sdk/commit/01d34f2139929fc58d0d3c799d4e120e74bdd409) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `5.1.1` to `5.2.0`

* [#4461](https://github.com/cloudflare/workers-sdk/pull/4461) [`fe1e6d8a`](https://github.com/cloudflare/workers-sdk/commit/fe1e6d8a3584def6a7c1c2e8dd362c7c5d3cbc97) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `@angular/create` from `17.0.0-rc.4` to `17.0.1`

- [#4462](https://github.com/cloudflare/workers-sdk/pull/4462) [`144a431a`](https://github.com/cloudflare/workers-sdk/commit/144a431ad35fe6850817b385da318b4e43845dca) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-next-app` from `13.4.19` to `14.0.3`

* [#4292](https://github.com/cloudflare/workers-sdk/pull/4292) [`75c3d4a7`](https://github.com/cloudflare/workers-sdk/commit/75c3d4a789b8e0e682f708065bd4db5f04c7b725) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Only commit the changes if the repository was generated (directly or not) by C3

  (This follows what CLI tools seems to generally do, avoids weird corner case
  behaviors users might have for example when running C3 inside monorepos and avoids commits
  when people don't want or expect them)

## 2.7.0

### Minor Changes

- [#4280](https://github.com/cloudflare/workers-sdk/pull/4280) [`a6cd9aff`](https://github.com/cloudflare/workers-sdk/commit/a6cd9aff92c636bdaa57f912868f328735e5686a) Thanks [@alan-agius4](https://github.com/alan-agius4)! - Update Angular template to use version 17

### Patch Changes

- [#4399](https://github.com/cloudflare/workers-sdk/pull/4399) [`789491bd`](https://github.com/cloudflare/workers-sdk/commit/789491bd1e5fd4f138036020e1af274884a29da0) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: move the Angular framework out of the C3 e2e test quarantine.

* [#4242](https://github.com/cloudflare/workers-sdk/pull/4242) [`a1c9f43f`](https://github.com/cloudflare/workers-sdk/commit/a1c9f43f3e1f8ff1b781b9f524ebac82afce7563) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `nuxi` from `3.9.0` to `3.9.1`

- [#4275](https://github.com/cloudflare/workers-sdk/pull/4275) [`e4aff81a`](https://github.com/cloudflare/workers-sdk/commit/e4aff81a1289ba52ee4fc40f5ee2ee34a9da690a) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.3.0` to `4.4.1`

* [#4288](https://github.com/cloudflare/workers-sdk/pull/4288) [`b7d91bb5`](https://github.com/cloudflare/workers-sdk/commit/b7d91bb58cb977b7e4f7667c086bed4c20afca94) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.14` to `1.2.15`

- [#4313](https://github.com/cloudflare/workers-sdk/pull/4313) [`18612851`](https://github.com/cloudflare/workers-sdk/commit/18612851d6275f25be9faeed06bc2053d7b0d837) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.12.8` to `5.12.9`

* [#4316](https://github.com/cloudflare/workers-sdk/pull/4316) [`3caa7860`](https://github.com/cloudflare/workers-sdk/commit/3caa7860b790d1e2f8c5af392a16cde3bb31ee09) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.1.0` to `2.2.0`

- [#4317](https://github.com/cloudflare/workers-sdk/pull/4317) [`db8b5fe5`](https://github.com/cloudflare/workers-sdk/commit/db8b5fe51f0f75bdeb773cd161f190d653dff481) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-docusaurus` from `2.4.3` to `3.0.0`

* [#4334](https://github.com/cloudflare/workers-sdk/pull/4334) [`bde0a1bd`](https://github.com/cloudflare/workers-sdk/commit/bde0a1bd190a63adc1782cc62292b9f1f31bca4f) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.15` to `1.2.16`

- [#4335](https://github.com/cloudflare/workers-sdk/pull/4335) [`c1223c53`](https://github.com/cloudflare/workers-sdk/commit/c1223c53cd4824ab0346347746d43e3a27dfaed1) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-solid` from `0.3.8` to `0.3.9`

* [#4346](https://github.com/cloudflare/workers-sdk/pull/4346) [`71eff285`](https://github.com/cloudflare/workers-sdk/commit/71eff285ec4a8f831fe1b9b8aa05d2b3a1921d04) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.16` to `1.2.17`

- [#4431](https://github.com/cloudflare/workers-sdk/pull/4431) [`c0d70bf5`](https://github.com/cloudflare/workers-sdk/commit/c0d70bf55c7e358287b8eaff1ef5716744117efa) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.4.1` to `4.5.1`

* [#4311](https://github.com/cloudflare/workers-sdk/pull/4311) [`35be4594`](https://github.com/cloudflare/workers-sdk/commit/35be459486864cd4d6a7aea7d357ada04f17bb0d) Thanks [@jculvey](https://github.com/jculvey)! - Changes c3 to use `npx` for running framework creation tools when it is invoked with `yarn`. This is
  needed since yarn can't `yarn create some-package@some-particular-version`.

- [#4226](https://github.com/cloudflare/workers-sdk/pull/4226) [`5810f815`](https://github.com/cloudflare/workers-sdk/commit/5810f8150eb775663177a43266233abac19e9781) Thanks [@jculvey](https://github.com/jculvey)! - Relax empty directory check. Directories containing certain common config files and/or files created by an ide will be exempt from the pre-flight check

* [#4249](https://github.com/cloudflare/workers-sdk/pull/4249) [`b18a2c0f`](https://github.com/cloudflare/workers-sdk/commit/b18a2c0f3b88b5ce986f8c134cfe6df4603b343d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - correct error message for unrecognized application type

- [#4403](https://github.com/cloudflare/workers-sdk/pull/4403) [`cb8ec90e`](https://github.com/cloudflare/workers-sdk/commit/cb8ec90e96a9fcf05ae0276258a9e19d656b9def) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - test: fix C3 e2e tests for Angular

* [#4249](https://github.com/cloudflare/workers-sdk/pull/4249) [`b18a2c0f`](https://github.com/cloudflare/workers-sdk/commit/b18a2c0f3b88b5ce986f8c134cfe6df4603b343d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - improve help message by adding more detailed descriptions about the various CLI options
  also let the user know that more information is available in the Cloudflare docs

- [#4339](https://github.com/cloudflare/workers-sdk/pull/4339) [`33bd75dc`](https://github.com/cloudflare/workers-sdk/commit/33bd75dc14695791d94deda36bb9f44c06d56c8e) Thanks [@alan-agius4](https://github.com/alan-agius4)! - Remove redundant polyfills from the Angular template

* [#4279](https://github.com/cloudflare/workers-sdk/pull/4279) [`2526794f`](https://github.com/cloudflare/workers-sdk/commit/2526794f214e730f7f88a8146ef24f50c2caf8f6) Thanks [@dnasdw](https://github.com/dnasdw)! - fix: use a valid compatibility date for the scheduled worker ts template

## 2.6.2

### Patch Changes

- [#4243](https://github.com/cloudflare/workers-sdk/pull/4243) [`bfb66aa0`](https://github.com/cloudflare/workers-sdk/commit/bfb66aa06c4075bb3f12ba702a555f51653a5199) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-vue` from `3.7.5` to `3.8.0`

* [#4244](https://github.com/cloudflare/workers-sdk/pull/4244) [`5c81d34d`](https://github.com/cloudflare/workers-sdk/commit/5c81d34d01454e129ca6587b6b99d6ea4ec9c870) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.13` to `1.2.14`

- [#4246](https://github.com/cloudflare/workers-sdk/pull/4246) [`67c4c2c0`](https://github.com/cloudflare/workers-sdk/commit/67c4c2c0f581047fece5401d5ccfff5f2476412e) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.12.7` to `5.12.8`

* [#4259](https://github.com/cloudflare/workers-sdk/pull/4259) [`b5e62b93`](https://github.com/cloudflare/workers-sdk/commit/b5e62b931ad6671e4dce9444a279bb3ec8f63991) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-hono` from `0.3.1` to `0.3.2`

- [#4268](https://github.com/cloudflare/workers-sdk/pull/4268) [`77820a22`](https://github.com/cloudflare/workers-sdk/commit/77820a22ce8c41870877387ff4012fa24a14fad8) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-solid` from `0.3.7` to `0.3.8`

* [#4215](https://github.com/cloudflare/workers-sdk/pull/4215) [`950bc401`](https://github.com/cloudflare/workers-sdk/commit/950bc4015fa408bfcd4fbf771cf1c3a062783d96) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix various logging of shell commands to correctly quote args when needed

- [#4189](https://github.com/cloudflare/workers-sdk/pull/4189) [`05798038`](https://github.com/cloudflare/workers-sdk/commit/05798038c85a83afb2c0e8ea9533c31a6fbe3e91) Thanks [@gabivlj](https://github.com/gabivlj)! - Move helper cli files of C3 into @cloudflare/cli and make Wrangler and C3 depend on it

* [#4200](https://github.com/cloudflare/workers-sdk/pull/4200) [`773e2a8c`](https://github.com/cloudflare/workers-sdk/commit/773e2a8cc07a6ff55a5a12edd103751eafcc9468) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix the generation of invalid/incorrect scripts for Next.js applications

## 2.6.1

### Patch Changes

- [#4213](https://github.com/cloudflare/workers-sdk/pull/4213) [`039acfd4`](https://github.com/cloudflare/workers-sdk/commit/039acfd4a35ce04105c26e8767320e7235921ff3) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-solid` from `0.3.6` to `0.3.7`

* [#4217](https://github.com/cloudflare/workers-sdk/pull/4217) [`b9687231`](https://github.com/cloudflare/workers-sdk/commit/b96872319bf59615f63276a60ec352113cb85455) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.2.1` to `4.3.0`

- [#4190](https://github.com/cloudflare/workers-sdk/pull/4190) [`c2457cb4`](https://github.com/cloudflare/workers-sdk/commit/c2457cb484f9e09752403116f137ab1bc40ae322) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Set the proper compatibility date for web applications (instead of using the current date)

* [#4216](https://github.com/cloudflare/workers-sdk/pull/4216) [`17c59f29`](https://github.com/cloudflare/workers-sdk/commit/17c59f2905d774418a496b290f024eb52e7031de) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - amend summary showing incorrect cd instruction for projects in nested paths

- [#4220](https://github.com/cloudflare/workers-sdk/pull/4220) [`2b4d9def`](https://github.com/cloudflare/workers-sdk/commit/2b4d9def1bd33f38b5c03a8c99c8f7a1879082da) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - don't retry the project creation multiple times when it fails because the project's name is already used

## 2.6.0

### Minor Changes

- [#4116](https://github.com/cloudflare/workers-sdk/pull/4116) [`5ff0ca02`](https://github.com/cloudflare/workers-sdk/commit/5ff0ca021de83add9f9e90ab71758f46311ebd65) Thanks [@jculvey](https://github.com/jculvey)! - Replaces the "prestart" and "predeploy" scripts when using Angular to better support pnpm

### Patch Changes

- [#4099](https://github.com/cloudflare/workers-sdk/pull/4099) [`4deda525`](https://github.com/cloudflare/workers-sdk/commit/4deda525ebd4a9fa65a4a1e827cfcd2fc2add592) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.12.4` to `5.12.5`

* [#4141](https://github.com/cloudflare/workers-sdk/pull/4141) [`9b2578aa`](https://github.com/cloudflare/workers-sdk/commit/9b2578aacb50c2be30852881cd4eb740d0b436c3) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `5.1.0` to `5.1.1`

- [#4184](https://github.com/cloudflare/workers-sdk/pull/4184) [`616b6610`](https://github.com/cloudflare/workers-sdk/commit/616b6610ed25689c093c466b28516a9802a301dd) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-hono` from `0.2.6` to `0.3.1`

* [#4191](https://github.com/cloudflare/workers-sdk/pull/4191) [`4b70c88c`](https://github.com/cloudflare/workers-sdk/commit/4b70c88cf59108ad98eeb021890485a88ddb10f8) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.0.1` to `2.1.0`

- [#4197](https://github.com/cloudflare/workers-sdk/pull/4197) [`9095c6ac`](https://github.com/cloudflare/workers-sdk/commit/9095c6acdaab61899286e3b136efd5b21dcc2723) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.12.5` to `5.12.7`

* [#4177](https://github.com/cloudflare/workers-sdk/pull/4177) [`2162501a`](https://github.com/cloudflare/workers-sdk/commit/2162501a0aac1ae5800c8e022568fc357a8c7ff6) Thanks [@jculvey](https://github.com/jculvey)! - Relax name validation for projects created with `--existing-script` flag

## 2.5.0

### Minor Changes

- [#4136](https://github.com/cloudflare/workers-sdk/pull/4136) [`0f043a12`](https://github.com/cloudflare/workers-sdk/commit/0f043a126e5499bc1fcfd09782369264e4246317) Thanks [@jculvey](https://github.com/jculvey)! - Fixes an issue that was causing the auto-update check not to run

### Patch Changes

- [#4128](https://github.com/cloudflare/workers-sdk/pull/4128) [`696d7f29`](https://github.com/cloudflare/workers-sdk/commit/696d7f29c6c8cb516164de8da35400ac7bca0694) Thanks [@jculvey](https://github.com/jculvey)! - Verify that project names are valid for pages projects

## 2.4.1

### Patch Changes

- [#4125](https://github.com/cloudflare/workers-sdk/pull/4125) [`d0e8e380`](https://github.com/cloudflare/workers-sdk/commit/d0e8e38035b7d65f99834700426d95dd88d54085) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.12` to `1.2.13`

* [#4152](https://github.com/cloudflare/workers-sdk/pull/4152) [`acf3b64b`](https://github.com/cloudflare/workers-sdk/commit/acf3b64b4757325ffb9298bfd5ff3cf0b87bcb19) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix incorrect service example in worker template toml files

- [#4119](https://github.com/cloudflare/workers-sdk/pull/4119) [`64c3ec15`](https://github.com/cloudflare/workers-sdk/commit/64c3ec15f71271395982746b173ddb5c17a3de0b) Thanks [@jculvey](https://github.com/jculvey)! - Don't prompt the user to use git if `user.name` and `user.email` haven't been configured

## 2.4.0

### Minor Changes

- [#4063](https://github.com/cloudflare/workers-sdk/pull/4063) [`cb4309f9`](https://github.com/cloudflare/workers-sdk/commit/cb4309f90b433fb7b6f81279878bca11fe2a6937) Thanks [@jculvey](https://github.com/jculvey)! - Bump supported node version to 18.14.1

  We've recently switched out testing infrastructure to test C3 on node version 18.14.1.
  As of earlier this month, Node v16 is no longer supported, and many of the underlying
  framework scaffolding tools that C3 uses (ex. `create-astro`, `gatsby`) have dropped
  support for node v16, which in turn causes C3 to fail for those frameworks.

* [#4065](https://github.com/cloudflare/workers-sdk/pull/4065) [`55298d9f`](https://github.com/cloudflare/workers-sdk/commit/55298d9f3ffc177cc390cd5e9ccc713261933585) Thanks [@jculvey](https://github.com/jculvey)! - Add support for bun

### Patch Changes

- [#3991](https://github.com/cloudflare/workers-sdk/pull/3991) [`80f78dad`](https://github.com/cloudflare/workers-sdk/commit/80f78dad4652cb9c6807c5144c4c32324f0c15e6) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.1.0` to `4.2.0`

* [#4002](https://github.com/cloudflare/workers-sdk/pull/4002) [`8ee46b06`](https://github.com/cloudflare/workers-sdk/commit/8ee46b063cab7a585074413b2c38a58a4e2f4eff) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-docusaurus` from `2.4.1` to `2.4.3`

- [#4012](https://github.com/cloudflare/workers-sdk/pull/4012) [`a21acf82`](https://github.com/cloudflare/workers-sdk/commit/a21acf8217fa2eff57cffb6753865a37386b5f13) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-solid` from `0.2.26` to `0.3.6`

* [#4091](https://github.com/cloudflare/workers-sdk/pull/4091) [`a9cb8c60`](https://github.com/cloudflare/workers-sdk/commit/a9cb8c608f2594170e92a0f49c3f85def4edf03c) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `5.0.6` to `5.1.0`

- [#4100](https://github.com/cloudflare/workers-sdk/pull/4100) [`866c7833`](https://github.com/cloudflare/workers-sdk/commit/866c7833ec091825a4916bd6dfbcbc04d8c0bafe) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `2.0.0` to `2.0.1`

* [#4103](https://github.com/cloudflare/workers-sdk/pull/4103) [`f79cf89a`](https://github.com/cloudflare/workers-sdk/commit/f79cf89aeefb072dde5fc1ada24001af74fa363b) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.2.0` to `4.2.1`

- [#4088](https://github.com/cloudflare/workers-sdk/pull/4088) [`35165a26`](https://github.com/cloudflare/workers-sdk/commit/35165a26d9e1eda1f049d5a5b5a1cb2cd1e09c9f) Thanks [@jculvey](https://github.com/jculvey)! - Fixes an issue where users were prompted for TypeScript twice during worker creation

* [#4087](https://github.com/cloudflare/workers-sdk/pull/4087) [`57e9f218`](https://github.com/cloudflare/workers-sdk/commit/57e9f218ae3ce11736d4ff6a09e05a6662ce13c5) Thanks [@jculvey](https://github.com/jculvey)! - Fixes an issue where exiting early from c3 would cause the terminal cursor to be hidden

- [#3754](https://github.com/cloudflare/workers-sdk/pull/3754) [`811730d8`](https://github.com/cloudflare/workers-sdk/commit/811730d85066904e5ca9161900577342d59ec851) Thanks [@RamIdeas](https://github.com/RamIdeas)! - .gitignore files were not included in our templates due to npm/npm#3763

  we now workaround this issue and ensure C3 templates include a .gitignore file

* [#4062](https://github.com/cloudflare/workers-sdk/pull/4062) [`02359bc5`](https://github.com/cloudflare/workers-sdk/commit/02359bc50353cbf698de193d56360b6dfc151ad0) Thanks [@jculvey](https://github.com/jculvey)! - Defaults the project type to `Web Framework`. The previous default was `"Hello World" worker`

- [#4030](https://github.com/cloudflare/workers-sdk/pull/4030) [`dba26262`](https://github.com/cloudflare/workers-sdk/commit/dba26262c72b4654c3c0799f975bcd8ff9210082) Thanks [@admah](https://github.com/admah)! - Fixes Workers templates to have a `dev` command in package.json to match comments in `index` files.

* [#3916](https://github.com/cloudflare/workers-sdk/pull/3916) [`15d75e50`](https://github.com/cloudflare/workers-sdk/commit/15d75e50bd9b8ce5837b390f8c2ce39eea446a7e) Thanks [@admah](https://github.com/admah)! - fix: update the main file in the c3 scheduled js template to index.js.

## 2.3.1

### Patch Changes

- [#4001](https://github.com/cloudflare/workers-sdk/pull/4001) [`fd39ae64`](https://github.com/cloudflare/workers-sdk/commit/fd39ae649dc0658de4cfd3eac6dcfc6b4ab6205a) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `nuxi` from `3.8.4` to `3.9.0`

## 2.3.0

### Minor Changes

- [#3887](https://github.com/cloudflare/workers-sdk/pull/3887) [`765ebc1c`](https://github.com/cloudflare/workers-sdk/commit/765ebc1ce293315345c0ccfee808cbc25262b2ed) Thanks [@G4brym](https://github.com/G4brym)! - Add OpenAPI 3.1 template project

* [#3888](https://github.com/cloudflare/workers-sdk/pull/3888) [`7310add1`](https://github.com/cloudflare/workers-sdk/commit/7310add1bb43c72f7b88cce7ed357fa5c11c6f75) Thanks [@G4brym](https://github.com/G4brym)! - Bump chatgptPlugin template itty-router-openapi version

### Patch Changes

- [#3970](https://github.com/cloudflare/workers-sdk/pull/3970) [`0a8d97c7`](https://github.com/cloudflare/workers-sdk/commit/0a8d97c7c6518b7a731197033762b1eeb542d4f7) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.0.1` to `4.1.0`

* [#3971](https://github.com/cloudflare/workers-sdk/pull/3971) [`1723d3e6`](https://github.com/cloudflare/workers-sdk/commit/1723d3e63f593b909cc253a4415a5e06d8c1162d) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-svelte` from `4.2.0` to `5.0.6`

- [#3972](https://github.com/cloudflare/workers-sdk/pull/3972) [`dac69503`](https://github.com/cloudflare/workers-sdk/commit/dac69503b998d0f3811f06d4e9bdf871865496e4) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-remix` from `1.19.3` to `2.0.0`

* [#3973](https://github.com/cloudflare/workers-sdk/pull/3973) [`324907ac`](https://github.com/cloudflare/workers-sdk/commit/324907acbbc4b82e717681c9d447c9ee2f4f3bfc) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `nuxi` from `3.6.5` to `3.8.4`

- [#3980](https://github.com/cloudflare/workers-sdk/pull/3980) [`1354ab36`](https://github.com/cloudflare/workers-sdk/commit/1354ab365f96b3b16e57d4496014f42bba3c1aa6) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-astro` from `4.0.1` to `4.1.0`

* [#3987](https://github.com/cloudflare/workers-sdk/pull/3987) [`fe227900`](https://github.com/cloudflare/workers-sdk/commit/fe227900955f866def9c3d0dcf51de56a99151ea) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-vue` from `3.6.4` to `3.7.5`

- [#3988](https://github.com/cloudflare/workers-sdk/pull/3988) [`d8833eff`](https://github.com/cloudflare/workers-sdk/commit/d8833eff9779c4d7d0f653666303b8951ef6aaed) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `gatsby` from `5.11.0` to `5.12.4`

* [#3990](https://github.com/cloudflare/workers-sdk/pull/3990) [`07b57803`](https://github.com/cloudflare/workers-sdk/commit/07b57803193232254be5c576ad06dbc7a4407744) Thanks [@dependabot](https://github.com/apps/dependabot)! - C3: Bumped `create-qwik` from `1.2.7` to `1.2.12`

## 2.2.3

### Patch Changes

- [#3935](https://github.com/cloudflare/workers-sdk/pull/3935) [`bdb39edc`](https://github.com/cloudflare/workers-sdk/commit/bdb39edc4d072309794786c79005bdd59559053d) Thanks [@IgorMinar](https://github.com/IgorMinar)! - fix: remove unused env variable from sveltekit project template

## 2.2.2

### Patch Changes

- [#3880](https://github.com/cloudflare/workers-sdk/pull/3880) [`c6c435eb`](https://github.com/cloudflare/workers-sdk/commit/c6c435ebe8984590b1800ac7acf4fec9f7538373) Thanks [@admah](https://github.com/admah)! - Update Worker templates from worker.{ts,js} to index.{ts,js} to better align with docs and examples

## 2.2.1

### Patch Changes

- [#3841](https://github.com/cloudflare/workers-sdk/pull/3841) [`81c45b98`](https://github.com/cloudflare/workers-sdk/commit/81c45b988a2f772279bc5f37dba6b8cb83afef36) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Fail and display the help message if an unrecognized argument is passed to C3

## 2.2.0

### Minor Changes

- [#3776](https://github.com/cloudflare/workers-sdk/pull/3776) [`83e526b3`](https://github.com/cloudflare/workers-sdk/commit/83e526b3c9ea53b8cfbba5ab222613bf21c1db79) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add final commit when generating Pages projects

  before after the user would have completed the creation of a Pages project
  they would find the Cloudflare added/modified files uncommitted, instead of
  leaving these uncommitted this change adds an extra commit (on top of the
  framework specific) which also contains some useful information about the
  project

* [#3803](https://github.com/cloudflare/workers-sdk/pull/3803) [`9156994e`](https://github.com/cloudflare/workers-sdk/commit/9156994e1b1dccccc0dde8b6eba01a5a241f9511) Thanks [@jculvey](https://github.com/jculvey)! - C3: Checks for a newer version of create-cloudflare and uses it if available. This behavior can be suppressed with the --no-auto-update flag.

### Patch Changes

- [#3807](https://github.com/cloudflare/workers-sdk/pull/3807) [`fac199ba`](https://github.com/cloudflare/workers-sdk/commit/fac199ba0c3bee758ac13fa8e6133c19f4af845d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - adjusted arguments passing so that arguments following an extra `--` are
  passed to the underlying cli (if any)

  For example:

  ```
  $ npm create cloudflare -- --framework=X -- -a -b
  ```

  now will run the framework X's cli with the `-a` and `-b` arguments
  (such arguments will be completely ignored by C3)

* [#3822](https://github.com/cloudflare/workers-sdk/pull/3822) [`3db34519`](https://github.com/cloudflare/workers-sdk/commit/3db3451988988c0af82023cc53975bbaef14ac8a) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - update the frameworks' cli versions used in C3

  - `@angular/cli` from 16.1.x to 16.2.0
  - `create-next-app` from 13.4.2 to 13.4.19
  - `create-remix` from 1.16.0 to 1.19.3
  - `gatsby` from 5.10.0 to 5.11.0
  - `nuxi` from 3.4.2 to 3.6.5

## 2.1.1

### Patch Changes

- [#3729](https://github.com/cloudflare/workers-sdk/pull/3729) [`9d8509e0`](https://github.com/cloudflare/workers-sdk/commit/9d8509e08acf082604ca896b4ab9ad5c05ae7505) Thanks [@jculvey](https://github.com/jculvey)! - Improve experience for WARP users by improving the reliability of the polling logic that waits for newly created apps to become available.

* [#3552](https://github.com/cloudflare/workers-sdk/pull/3552) [`77a43d2a`](https://github.com/cloudflare/workers-sdk/commit/77a43d2aa3633fc53be6fe365271d6fb59f44bd6) Thanks [@yusukebe](https://github.com/yusukebe)! - fix: use workers template for Hono

  Use a workers template instead of a pages template for `create-hono`.

## 2.1.0

### Minor Changes

- [#3604](https://github.com/cloudflare/workers-sdk/pull/3604) [`c3ff1c2b`](https://github.com/cloudflare/workers-sdk/commit/c3ff1c2b599c99f4915dad0362c7570cc2fa2bf3) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add the option to add the `eslint-plugin-next-on-pages` eslint plugin
  to developers creating a new Next.js app with eslint enabled

## 2.0.14

### Patch Changes

- [#3644](https://github.com/cloudflare/workers-sdk/pull/3644) [`775eb3bd`](https://github.com/cloudflare/workers-sdk/commit/775eb3bd32611d339ec4071c3d523d1d15bc7e30) Thanks [@jculvey](https://github.com/jculvey)! - Detect production branch when creating pages project

* [#3600](https://github.com/cloudflare/workers-sdk/pull/3600) [`3f7d6e7d`](https://github.com/cloudflare/workers-sdk/commit/3f7d6e7d654ea8958c6c2e0e78da4c5e4a78d2d5) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - improve the Nuxt deployment script so that it ships full stack applications (instead of server-side generated ones)

  as part of this change update the Nuxt build script to include the `NITRO_PRESET` env variable set to `cloudflare-pages` (needed to build Pages compatible applications)

  also write a .node-version file with the node version (so that it can properly working with the Pages CI)

## 2.0.13

### Patch Changes

- [#3609](https://github.com/cloudflare/workers-sdk/pull/3609) [`be3a43ff`](https://github.com/cloudflare/workers-sdk/commit/be3a43ff9d96785e379e8e6bcb72b332519216b0) Thanks [@admah](https://github.com/admah)! - Removes all typescript dependencies from javascript templates.

* [#3601](https://github.com/cloudflare/workers-sdk/pull/3601) [`e4ef867c`](https://github.com/cloudflare/workers-sdk/commit/e4ef867cc973d89eeee336ac4c4af62f905ae765) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - remove extra build added by mistake in solid deploy script

## 2.0.12

### Patch Changes

- [#3525](https://github.com/cloudflare/workers-sdk/pull/3525) [`1ce32968`](https://github.com/cloudflare/workers-sdk/commit/1ce32968b990fef59953b8cd61172b98fb2386e5) Thanks [@jculvey](https://github.com/jculvey)! - C3: Infer missing --type argument from --framework or --existing-script

* [#3580](https://github.com/cloudflare/workers-sdk/pull/3580) [`a7c1dd5b`](https://github.com/cloudflare/workers-sdk/commit/a7c1dd5b6c3a84b5ee4767935a2ca1820d28528e) Thanks [@jculvey](https://github.com/jculvey)! - C3: Prompt user to change directory in summary steps

- [#3551](https://github.com/cloudflare/workers-sdk/pull/3551) [`137e174d`](https://github.com/cloudflare/workers-sdk/commit/137e174d79e7c5779c24de904d3cd958587a87c7) Thanks [@yusukebe](https://github.com/yusukebe)! - fix: bump up `create-hono` version

  Bump up `create-hono` version to latest v0.2.6 for C3.

## 2.0.11

### Patch Changes

- [#3465](https://github.com/cloudflare/workers-sdk/pull/3465) [`528cc0fc`](https://github.com/cloudflare/workers-sdk/commit/528cc0fc583e9672247d5934c8b33afebbb834e7) Thanks [@jculvey](https://github.com/jculvey)! - Improvements to the project name selection prompt.

* [#3500](https://github.com/cloudflare/workers-sdk/pull/3500) [`c43fc4e8`](https://github.com/cloudflare/workers-sdk/commit/c43fc4e826eeca8a92c6749485eb3b8b47c4a818) Thanks [@jculvey](https://github.com/jculvey)! - Fix the output of the --version flag

- [#3343](https://github.com/cloudflare/workers-sdk/pull/3343) [`cc9ced83`](https://github.com/cloudflare/workers-sdk/commit/cc9ced83bc9f996b0380d46859990780e574884c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: use a valid compatibility date for worker templates

  Previously, we changed wrangler.toml to use the current date for the
  compatibility_date setting in wrangler.toml when generating workers.
  But this is almost always going to be too recent and results in a warning.

  Now we look up the most recent compatibility date via npm on the workerd
  package and use that instead.

  Fixes https://github.com/cloudflare/workers-sdk/issues/2385

* [#3516](https://github.com/cloudflare/workers-sdk/pull/3516) [`941764d0`](https://github.com/cloudflare/workers-sdk/commit/941764d0a2003ec8108ba75efe25978b000f637c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure the Angular fetch handler returns a "real" promise to Cloudflare

  Angular employs the Zone.js library to patch potentially async operations so that
  it can trigger change detection reliably. But in order to do this, it swaps out
  the native `Promise` with a `ZoneAwarePromise` class.

  The Cloudflare runtime (i.e. workerd) does runtime checks on the value returned
  from the `fetch()` handler, expecting it to be a native `Promise` and fails if not.

  This fix ensures that the actual object returned from the `fetch()` is actually a
  native `Promise`. We don't need to stop Angular using `ZoneAwarePromises` elsewhere.

- [#3486](https://github.com/cloudflare/workers-sdk/pull/3486) [`436f752d`](https://github.com/cloudflare/workers-sdk/commit/436f752d77b12b81d91341185fc9229f25571a69) Thanks [@Cherry](https://github.com/Cherry)! - fix: use wrangler deploy command for deploying applications instead of the deprecated wrangler publish

## 2.0.10

### Patch Changes

- [#3345](https://github.com/cloudflare/workers-sdk/pull/3345) [`42f7eb81`](https://github.com/cloudflare/workers-sdk/commit/42f7eb815ea273ab6370dadf423c0cf79cc20aa8) Thanks [@jculvey](https://github.com/jculvey)! - Use `pnpm dlx` instead of `pnpx` for versions of pnpm that support it

* [#3435](https://github.com/cloudflare/workers-sdk/pull/3435) [`23be8025`](https://github.com/cloudflare/workers-sdk/commit/23be8025f5812f12a69270d44deff60f4bd33ae0) Thanks [@sdnts](https://github.com/sdnts)! - Updated wrangler.toml for Workers projects generated by create-cloudflare

- [#3496](https://github.com/cloudflare/workers-sdk/pull/3496) [`91135e02`](https://github.com/cloudflare/workers-sdk/commit/91135e02cc97d11a6762c05e788c705697c477cb) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that default project name can be used

  If you hit enter when asked for the name of the project, you expect it
  to use the default value. But the project name validation was then failing
  as it was receiving undefined for the value of the input rather than the
  default value.

  Now the validator will be passed the default if no value was provided.

* [#3474](https://github.com/cloudflare/workers-sdk/pull/3474) [`a72dc0a1`](https://github.com/cloudflare/workers-sdk/commit/a72dc0a16577558e599ea9ced7fa39cd952c2b78) Thanks [@elithrar](https://github.com/elithrar)! - Add new Queues and Scheduled (Cron Trigger) Worker templates.

- [#3446](https://github.com/cloudflare/workers-sdk/pull/3446) [`ca0bd174`](https://github.com/cloudflare/workers-sdk/commit/ca0bd174c4e56e0d33c88c0b9bdba9489b2c78eb) Thanks [@admah](https://github.com/admah)! - refactor: rename `simple` template to `hello-world` in create-cloudflare package

  This change describes the "hello-world" template more accurately.
  Also, new e2e tests have been added to validate that Workers templates are created correctly.

* [#3359](https://github.com/cloudflare/workers-sdk/pull/3359) [`5eef992f`](https://github.com/cloudflare/workers-sdk/commit/5eef992f2c9f71a4c9d5e0cc2820aad24b7ef382) Thanks [@RamIdeas](https://github.com/RamIdeas)! - `wrangler init ... -y` now delegates to C3 without prompts (respects the `-y` flag)

## 2.0.9

### Patch Changes

- [#3245](https://github.com/cloudflare/workers-sdk/pull/3245) [`4082cfcb`](https://github.com/cloudflare/workers-sdk/commit/4082cfcbdf08740d4a608d3d87df22e51ad0ce4a) Thanks [@james-elicx](https://github.com/james-elicx)! - Support for setting compatibility flags for each framework when creating a new pages project.

* [#3295](https://github.com/cloudflare/workers-sdk/pull/3295) [`2dc55daf`](https://github.com/cloudflare/workers-sdk/commit/2dc55dafaac1d42a6ec5a2cd90942f9a168b9f40) Thanks [@Cherry](https://github.com/Cherry)! - fix: use tabs by default in prettier configs

- [#3245](https://github.com/cloudflare/workers-sdk/pull/3245) [`4082cfcb`](https://github.com/cloudflare/workers-sdk/commit/4082cfcbdf08740d4a608d3d87df22e51ad0ce4a) Thanks [@james-elicx](https://github.com/james-elicx)! - Fix support for creating API route handlers in the Next.js template when using the app directory.

## 2.0.8

### Patch Changes

- [#3260](https://github.com/cloudflare/workers-sdk/pull/3260) [`7249f344`](https://github.com/cloudflare/workers-sdk/commit/7249f344109fe1a8f67859e9aff227c7951bc6b9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add polling for deployed Pages projects

  When create-cloudflare deploys to Pages, it can take a while before the website is ready to be viewed.
  This change adds back in polling of the site and then opening a browser when the URL is ready.

* [#3272](https://github.com/cloudflare/workers-sdk/pull/3272) [`57f80551`](https://github.com/cloudflare/workers-sdk/commit/57f80551961c2f67bf057591518d573f71a51c8f) Thanks [@markdalgleish](https://github.com/markdalgleish)! - Use full Remix template URL rather than the `cloudflare-pages` shorthand since it will be removed in a future version of `create-remix`

- [#3291](https://github.com/cloudflare/workers-sdk/pull/3291) [`c1be44c8`](https://github.com/cloudflare/workers-sdk/commit/c1be44c8ef64f18dbd65a2399e845d3df1d0c1f2) Thanks [@Cherry](https://github.com/Cherry)! - fix: specify correct startup command in logs for newly created c3 projects

## 2.0.7

### Patch Changes

- [#3283](https://github.com/cloudflare/workers-sdk/pull/3283) [`74decfa7`](https://github.com/cloudflare/workers-sdk/commit/74decfa768b7a8ba0f04cf6f437ef075629fb6a7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: Use correct path to worker source in wrangler.toml of JavaScript simple template

## 2.0.6

### Patch Changes

- [#3273](https://github.com/cloudflare/workers-sdk/pull/3273) [`20479027`](https://github.com/cloudflare/workers-sdk/commit/204790272a813a511837a660d3d3143d8996f641) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support spawning new processes on Windows

* [#3282](https://github.com/cloudflare/workers-sdk/pull/3282) [`e9210590`](https://github.com/cloudflare/workers-sdk/commit/e9210590d3406fe899170542b67286b2ae299fe9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure templates are included in deployed package

## 2.0.5

### Patch Changes

- [#3267](https://github.com/cloudflare/workers-sdk/pull/3267) [`186eed94`](https://github.com/cloudflare/workers-sdk/commit/186eed94050d2224eb70799b2d2611d9dba91515) Thanks [@KianNH](https://github.com/KianNH)! - [C3] Fix Worker path in JavaScript template

## 2.0.3

### Patch Changes

- [#3247](https://github.com/cloudflare/workers-sdk/pull/3247) [`db9f0e92`](https://github.com/cloudflare/workers-sdk/commit/db9f0e92b39cfe0377c3c624a84a1db1385afb1a) Thanks [@eneajaho](https://github.com/eneajaho)! - Update versionMap.json to include angular @16.0.x rather than @next

* [#3242](https://github.com/cloudflare/workers-sdk/pull/3242) [`739bd656`](https://github.com/cloudflare/workers-sdk/commit/739bd65624386dcf020c07190e8427b59a9e6229) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: correctly format the compatibility_date field in generated wrangler.toml

  Fixes #3240

- [#3253](https://github.com/cloudflare/workers-sdk/pull/3253) [`7cefb4db`](https://github.com/cloudflare/workers-sdk/commit/7cefb4dbe7d0c6117401fd0e182e112f94f566a7) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - use wrangler@3 as devDep in C3 worker templates

## 2.0.2

### Patch Changes

- [#3238](https://github.com/cloudflare/workers-sdk/pull/3238) [`9973ea29`](https://github.com/cloudflare/workers-sdk/commit/9973ea2953873c1d9d1822dfc35fd04bc321677a) Thanks [@jculvey](https://github.com/jculvey)! - Bumping version of qwik to 1.1.x
