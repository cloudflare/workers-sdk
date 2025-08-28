# @cloudflare/vite-plugin

## 1.12.1

### Patch Changes

- [#10482](https://github.com/cloudflare/workers-sdk/pull/10482) [`aec77cc`](https://github.com/cloudflare/workers-sdk/commit/aec77ccb1578918804a3b058a1cb676215c6ddc9) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Pass the `compatibility_date` and `compatibility_flags` to the `unenv` preset. This enables support for the `node:http` and `node:https` modules.

- Updated dependencies [[`76d9aa2`](https://github.com/cloudflare/workers-sdk/commit/76d9aa2335cb52aec3e4a86195b40002ff538022), [`85be2b6`](https://github.com/cloudflare/workers-sdk/commit/85be2b6a690dbe51d54b9de8ec6dfa6a64e03ac4), [`452ad0b`](https://github.com/cloudflare/workers-sdk/commit/452ad0b1ec58c8078084e0946bf1b3e6ab7f307f), [`7c339ae`](https://github.com/cloudflare/workers-sdk/commit/7c339aeb0392e41b9a306c84538950f32c9a0dd4)]:
  - @cloudflare/unenv-preset@2.7.0
  - wrangler@4.33.1
  - miniflare@4.20250823.1

## 1.12.0

### Minor Changes

- [#10416](https://github.com/cloudflare/workers-sdk/pull/10416) [`7b05c8e`](https://github.com/cloudflare/workers-sdk/commit/7b05c8ef51ec7b41dd17ff2e0b157e06961330de) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - Add support for testing [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally) and [Email Workers](https://developers.cloudflare.com/email-routing/email-workers/local-development/) in `vite dev` and `vite preview`.

### Patch Changes

- [#10422](https://github.com/cloudflare/workers-sdk/pull/10422) [`88fd2f9`](https://github.com/cloudflare/workers-sdk/commit/88fd2f93a60211916e8c228ef63d08bb777c6314) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Statically replace the value of `process.env.NODE_ENV` in development when the `nodejs_compat` compatibility flag is enabled.
  Previously, this was replaced at build time when `nodejs_compat` was enabled and at dev and build time when `nodejs_compat` was not enabled.

- [#10065](https://github.com/cloudflare/workers-sdk/pull/10065) [`3024ec1`](https://github.com/cloudflare/workers-sdk/commit/3024ec187c974b683b2834c9c467456b586496c0) Thanks [@MichaelDeBoey](https://github.com/MichaelDeBoey)! - Update `@mjackson/node-fetch-server` to `@remix-run/node-fetch-server`

- Updated dependencies [[`c4fd176`](https://github.com/cloudflare/workers-sdk/commit/c4fd176a9caec0b24da258adb48f4a76f37bd9c7), [`19e2aab`](https://github.com/cloudflare/workers-sdk/commit/19e2aab1d68594c7289d0aa16474544919fd5b9b), [`c4fd176`](https://github.com/cloudflare/workers-sdk/commit/c4fd176a9caec0b24da258adb48f4a76f37bd9c7), [`e81c2cf`](https://github.com/cloudflare/workers-sdk/commit/e81c2cf076a87eefd29e238476c0c180ae731a0d)]:
  - wrangler@4.33.0
  - @cloudflare/unenv-preset@2.6.3
  - miniflare@4.20250823.0

## 1.11.7

### Patch Changes

- [#10415](https://github.com/cloudflare/workers-sdk/pull/10415) [`718fffc`](https://github.com/cloudflare/workers-sdk/commit/718fffcd73c51eeb4ba9175c5bc5878342e03d4c) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Exclude Cloudflare built-ins from client dependency optimization.
  Some frameworks allow users to mix client and server code in the same file and then extract the server code.
  As the dependency optimization may happen before the server code is extracted, we now exclude Cloudflare built-ins from client optimization.
- Updated dependencies [[`d304055`](https://github.com/cloudflare/workers-sdk/commit/d3040550adaad031f24327fbfbe9fecdeface0b5), [`f534c0d`](https://github.com/cloudflare/workers-sdk/commit/f534c0d9fd8df1c620311c4acffa6d4f0fc12576), [`da40571`](https://github.com/cloudflare/workers-sdk/commit/da40571245f4276c236503ff563a27caadf02ba4), [`0a96e69`](https://github.com/cloudflare/workers-sdk/commit/0a96e6949cf0097a2b315d44a6262017bb4129a3), [`f9f7519`](https://github.com/cloudflare/workers-sdk/commit/f9f75195f8b2aa28bc297cb04e6fd4e4195a1300), [`4728c68`](https://github.com/cloudflare/workers-sdk/commit/4728c684dad6e91748cdd3f40a216664c53ae007)]:
  - wrangler@4.32.0
  - miniflare@4.20250816.1

## 1.11.6

### Patch Changes

- Updated dependencies [[`565c3a3`](https://github.com/cloudflare/workers-sdk/commit/565c3a3ddf381945b0bea6c99029d8783e68f6bb), [`ddadb93`](https://github.com/cloudflare/workers-sdk/commit/ddadb9320fef96f52fe010f0e98fd75d5a2925ea), [`9b09751`](https://github.com/cloudflare/workers-sdk/commit/9b097518456fecee5eb0fab1f56d3a269e8bdfc5), [`cadf19a`](https://github.com/cloudflare/workers-sdk/commit/cadf19ad1050627ab0b0e107c9533657e01c178d), [`20520fa`](https://github.com/cloudflare/workers-sdk/commit/20520faa340005b9713007ccb8480fb6e97028d3), [`875197a`](https://github.com/cloudflare/workers-sdk/commit/875197a570edacbf1849a2f3d76c011e9b6f9cbf)]:
  - miniflare@4.20250816.0
  - wrangler@4.31.0
  - @cloudflare/unenv-preset@2.6.2

## 1.11.5

### Patch Changes

- Updated dependencies [[`76a6701`](https://github.com/cloudflare/workers-sdk/commit/76a6701fd5dc2d8493ad28a0ba8e79530885c05e), [`d54d8b7`](https://github.com/cloudflare/workers-sdk/commit/d54d8b73a2771cde9645937ff241675dddf0e8d2), [`979984b`](https://github.com/cloudflare/workers-sdk/commit/979984b8dfd3bc5d18c2aeedc4850da8c41d0476), [`80e964c`](https://github.com/cloudflare/workers-sdk/commit/80e964c7c756895719b94c0597da23dca91c2c34), [`a5a1426`](https://github.com/cloudflare/workers-sdk/commit/a5a1426a9ead85d2518f01fde0c1dbc02f98c4df), [`ae0c806`](https://github.com/cloudflare/workers-sdk/commit/ae0c806087c203da6a3d7da450e8fabe0d81c987), [`0c04da9`](https://github.com/cloudflare/workers-sdk/commit/0c04da9b3a8dcf1220b46a0fdd463ba0bad0f9a1), [`b524a6f`](https://github.com/cloudflare/workers-sdk/commit/b524a6fd4a19ef551517bb6c8cb32582862f7202), [`eb32a3a`](https://github.com/cloudflare/workers-sdk/commit/eb32a3ab4c4446a4844bea71353b59e36715e6a6), [`4288a61`](https://github.com/cloudflare/workers-sdk/commit/4288a61c1f8abd8243d3218749ea700a383954b9)]:
  - wrangler@4.30.0
  - miniflare@4.20250813.1

## 1.11.4

### Patch Changes

- Updated dependencies [[`5020694`](https://github.com/cloudflare/workers-sdk/commit/5020694dd35578dcf3f1669780889fc0ba632c8e)]:
  - miniflare@4.20250813.0
  - wrangler@4.29.1

## 1.11.3

### Patch Changes

- Updated dependencies [[`e7cae16`](https://github.com/cloudflare/workers-sdk/commit/e7cae16d5be9a8a0487ffab351ccf8f27808524f), [`3b6ab8a`](https://github.com/cloudflare/workers-sdk/commit/3b6ab8a8745367f05f370df163d908560b7e18a6), [`c58a05c`](https://github.com/cloudflare/workers-sdk/commit/c58a05cdc6d4e900541857be0e931250352199b8), [`42aafa3`](https://github.com/cloudflare/workers-sdk/commit/42aafa3bbea18aa41962610eb5b828790c9a4727), [`70bd966`](https://github.com/cloudflare/workers-sdk/commit/70bd9665fefd33ddf84b84d6938a46f0501eec1a), [`d391076`](https://github.com/cloudflare/workers-sdk/commit/d39107694b6bd9d63f15b529798aba0fd9a43643), [`422ae22`](https://github.com/cloudflare/workers-sdk/commit/422ae22348ca7b4cc394987e547517ae0aae461d), [`1479fd0`](https://github.com/cloudflare/workers-sdk/commit/1479fd06b91f9ab529ba4b8824d938e5da3184a0), [`80960b9`](https://github.com/cloudflare/workers-sdk/commit/80960b9297a8e6009ee19fa8708651539fec76d6), [`05c5b28`](https://github.com/cloudflare/workers-sdk/commit/05c5b286307bb4b55bd7768bd5873b54f8b06079), [`5d5ecd5`](https://github.com/cloudflare/workers-sdk/commit/5d5ecd558d58461f203f882011df3e4d2652305c), [`e3d9703`](https://github.com/cloudflare/workers-sdk/commit/e3d9703c8733567b9bcad4d6264958f6ba6876f6), [`bd8223d`](https://github.com/cloudflare/workers-sdk/commit/bd8223de34e74b150a0c7ac5fc66488791f17178), [`e7cae16`](https://github.com/cloudflare/workers-sdk/commit/e7cae16d5be9a8a0487ffab351ccf8f27808524f), [`d481901`](https://github.com/cloudflare/workers-sdk/commit/d48190127fbb564c5abdd3c8f33433a6381d8899), [`9aad334`](https://github.com/cloudflare/workers-sdk/commit/9aad334d282c863971b1ee84324ecfc60a022222), [`28494f4`](https://github.com/cloudflare/workers-sdk/commit/28494f413bba3c509c56762b9260edd0ffef4f28), [`8cf47f9`](https://github.com/cloudflare/workers-sdk/commit/8cf47f954d621d20e4dfb3685f7e496792853c51)]:
  - wrangler@4.29.0
  - miniflare@4.20250803.1
  - @cloudflare/unenv-preset@2.6.1

## 1.11.2

### Patch Changes

- Updated dependencies [[`773cca3`](https://github.com/cloudflare/workers-sdk/commit/773cca387b5ef01221c7a304883f8b36d1b386da), [`773cca3`](https://github.com/cloudflare/workers-sdk/commit/773cca387b5ef01221c7a304883f8b36d1b386da), [`2e8eb24`](https://github.com/cloudflare/workers-sdk/commit/2e8eb249a1da8a80455e25dba52455ee534c1490), [`93c4c26`](https://github.com/cloudflare/workers-sdk/commit/93c4c26eb5e13bef366add6f96959ccddd64d43b), [`48853a6`](https://github.com/cloudflare/workers-sdk/commit/48853a6882b0bb390b989c55a16aed232cdc8ddc), [`2e8eb24`](https://github.com/cloudflare/workers-sdk/commit/2e8eb249a1da8a80455e25dba52455ee534c1490)]:
  - wrangler@4.28.1

## 1.11.1

### Patch Changes

- [#9993](https://github.com/cloudflare/workers-sdk/pull/9993) [`9901788`](https://github.com/cloudflare/workers-sdk/commit/9901788035e858d11632d2df857fa3cc536531e6) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix issue that resulted in `A hanging Promise was canceled` errors when developing large applications.
  We now handle requests for modules in a Durable Object so that they can be shared across invocations.

  Additionally, using `import.meta.hot.send` within the context of a request is now supported.

- [#9556](https://github.com/cloudflare/workers-sdk/pull/9556) [`8ba7736`](https://github.com/cloudflare/workers-sdk/commit/8ba7736a8ae5666870d12945a1cb6185b6ac3633) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: cross-process service bindings no longer skip static asset serving

- [#10099](https://github.com/cloudflare/workers-sdk/pull/10099) [`360004d`](https://github.com/cloudflare/workers-sdk/commit/360004d4d96eb1e89f9a3e01eaea27197e08bf8a) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: move local dev container cleanup to process exit hook. This should ensure containers are cleaned up even when Wrangler is shut down programatically.

- [#10173](https://github.com/cloudflare/workers-sdk/pull/10173) [`4e62cd8`](https://github.com/cloudflare/workers-sdk/commit/4e62cd8d30781917857fda8d529637ea45699b89) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Ensure that headers set via `server.headers` in the Vite config are added to HTML asset responses in development.

- Updated dependencies [[`6b9cd5b`](https://github.com/cloudflare/workers-sdk/commit/6b9cd5b18775446760e938a10bf8ca1cfbb8c96f), [`b4d1373`](https://github.com/cloudflare/workers-sdk/commit/b4d13733b5f64f84274a194dd725943658d6184e), [`631f26d`](https://github.com/cloudflare/workers-sdk/commit/631f26df58d8933da81fb312f2ba2e30dc22821a), [`d6ecd05`](https://github.com/cloudflare/workers-sdk/commit/d6ecd05be5d272857f2b3e243e57ddee4e6a576c), [`b4d1373`](https://github.com/cloudflare/workers-sdk/commit/b4d13733b5f64f84274a194dd725943658d6184e), [`360004d`](https://github.com/cloudflare/workers-sdk/commit/360004d4d96eb1e89f9a3e01eaea27197e08bf8a), [`e82aa19`](https://github.com/cloudflare/workers-sdk/commit/e82aa199b86f9b9de95f39ad1460d48feec8b00f), [`dae1377`](https://github.com/cloudflare/workers-sdk/commit/dae1377cbee54cf394e070917087da6c9df37d1f), [`8ba7736`](https://github.com/cloudflare/workers-sdk/commit/8ba7736a8ae5666870d12945a1cb6185b6ac3633), [`1655bec`](https://github.com/cloudflare/workers-sdk/commit/1655bec50c0bfa3efbfc84b171171a44b120f03f), [`354a001`](https://github.com/cloudflare/workers-sdk/commit/354a001e3e7e8189f80c1baf52bac13bca08ad74), [`5c3b83f`](https://github.com/cloudflare/workers-sdk/commit/5c3b83fc40525590deb62ceda2a8d303a42bc1d8), [`502a8e0`](https://github.com/cloudflare/workers-sdk/commit/502a8e0db0eecda425912340088ae51568bbf4f6), [`07c8611`](https://github.com/cloudflare/workers-sdk/commit/07c8611b69721e8aa1300ba209dc45a75173e1d7), [`7e204a9`](https://github.com/cloudflare/workers-sdk/commit/7e204a941e4e907b690f2ad6ff3cb10f2d2f20bd), [`3f83ac1`](https://github.com/cloudflare/workers-sdk/commit/3f83ac1d8b67c07a0c7d08961b8a81a830543853)]:
  - @cloudflare/unenv-preset@2.6.0
  - wrangler@4.28.0
  - miniflare@4.20250803.0

## 1.11.0

### Minor Changes

- [#9914](https://github.com/cloudflare/workers-sdk/pull/9914) [`a24c9d8`](https://github.com/cloudflare/workers-sdk/commit/a24c9d8c83d2cd1363f594d97829467c48fc7e7b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Add support for loading local dev vars from .env files

  If there are no `.dev.vars` or `.dev.vars.<environment>` files, when running Wrangler or the Vite plugin in local development mode,
  they will now try to load additional local dev vars from `.env`, `.env.local`, `.env.<environment>` and `.env.<environment>.local` files.

  These loaded vars are only for local development and have no effect in production to the vars in a deployed Worker.
  Wrangler and Vite will continue to load `.env` files in order to configure themselves as a tool.

  Further details:

  - In `vite build` the local vars will be computed and stored in a `.dev.vars` file next to the compiled Worker code, so that `vite preview` can use them.
  - The `wrangler types` command will similarly read the `.env` files (if no `.dev.vars` files) in order to generate the `Env` interface.
  - If the `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV` environment variable is `"false"` then local dev variables will not be loaded from `.env` files.
  - If the `CLOUDFLARE_INCLUDE_PROCESS_ENV` environment variable is `"true"` then all the environment variables found on `process.env` will be included as local dev vars.
  - Wrangler (but not Vite plugin) also now supports the `--env-file=<path/to/dotenv/file>` global CLI option. This affects both loading `.env` to configure Wrangler the tool as well as loading local dev vars.

### Patch Changes

- [#10071](https://github.com/cloudflare/workers-sdk/pull/10071) [`4a4049c`](https://github.com/cloudflare/workers-sdk/commit/4a4049c69aa5e556127f9aa1304c5ce0d348b5a0) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat(vite-plugin): Add Containers-related info logs

  Add logs, when a Worker has Containers configured, providing information about container build status, and how to rebuild containers during local development.

- Updated dependencies [[`9b61f44`](https://github.com/cloudflare/workers-sdk/commit/9b61f44c899aa6530ecd20f283dc4e2a9f7c79c7), [`0f7820e`](https://github.com/cloudflare/workers-sdk/commit/0f7820ee384ed708e5d9058f9859b7f1d87e1807), [`a24c9d8`](https://github.com/cloudflare/workers-sdk/commit/a24c9d8c83d2cd1363f594d97829467c48fc7e7b), [`e9bb8d3`](https://github.com/cloudflare/workers-sdk/commit/e9bb8d372a149d9b99119e3b5b077935af0d98ae)]:
  - miniflare@4.20250730.0
  - wrangler@4.27.0

## 1.10.2

### Patch Changes

- [#10048](https://github.com/cloudflare/workers-sdk/pull/10048) [`dbdbb8c`](https://github.com/cloudflare/workers-sdk/commit/dbdbb8c41ea5612f9e79bde5cfd0192c70025ee7) Thanks [@vicb](https://github.com/vicb)! - pass the compatibility date and flags to the unenv preset

- [#10096](https://github.com/cloudflare/workers-sdk/pull/10096) [`687655f`](https://github.com/cloudflare/workers-sdk/commit/687655f8d399140e7b8d61c1fc04140e7455344a) Thanks [@vicb](https://github.com/vicb)! - bump unenv to 2.0.0-rc.19

- [#10040](https://github.com/cloudflare/workers-sdk/pull/10040) [`26ffa05`](https://github.com/cloudflare/workers-sdk/commit/26ffa055cedcec9ac80ec952d7e9c4736ffdb0ee) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat(vite-plugin): Add containers support in `vite preview`

  Adds support for Cloudflare Containers in `vite preview`. Please note that at the time of this PR a container image can only specify the path to a `Dockerfile`. Support for registry links will be added in a later version.

- [#10054](https://github.com/cloudflare/workers-sdk/pull/10054) [`bc910f9`](https://github.com/cloudflare/workers-sdk/commit/bc910f9a313c403530d46838279affadb2b21e75) Thanks [@eltigerchino](https://github.com/eltigerchino)! - Add `worker` to the default conditions for resolving packages

  This makes it consistent with the conditions used when bundling Worker code with Wrangler.

- [#10061](https://github.com/cloudflare/workers-sdk/pull/10061) [`f8a80a8`](https://github.com/cloudflare/workers-sdk/commit/f8a80a807576f7fa6d9eca37d297c50793bca188) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: properly set the socket path that the container engine is listening on.

  Previously, this was only picking up the value set in Wrangler config under `dev.containerEngine`, but this value can also be set from env vars or automatically read from the current docker context.

- Updated dependencies [[`82a5b2e`](https://github.com/cloudflare/workers-sdk/commit/82a5b2e09fef9046140181c06aba1f82ce8314af), [`f8f7352`](https://github.com/cloudflare/workers-sdk/commit/f8f735282bdcab25c90b986ff1ae45e20a4625c2), [`2df1d06`](https://github.com/cloudflare/workers-sdk/commit/2df1d066cfe376b831ff0b29b656437d869791e5), [`f8a80a8`](https://github.com/cloudflare/workers-sdk/commit/f8a80a807576f7fa6d9eca37d297c50793bca188), [`dbdbb8c`](https://github.com/cloudflare/workers-sdk/commit/dbdbb8c41ea5612f9e79bde5cfd0192c70025ee7), [`5991a9c`](https://github.com/cloudflare/workers-sdk/commit/5991a9cb009fa3c24d848467397ceabe23e7c90a), [`687655f`](https://github.com/cloudflare/workers-sdk/commit/687655f8d399140e7b8d61c1fc04140e7455344a), [`755a249`](https://github.com/cloudflare/workers-sdk/commit/755a24938f1c264baf7fcc76d775449d87e0bbbf)]:
  - miniflare@4.20250726.0
  - wrangler@4.26.1
  - @cloudflare/unenv-preset@2.5.0

## 1.10.1

### Patch Changes

- [#10031](https://github.com/cloudflare/workers-sdk/pull/10031) [`823cba8`](https://github.com/cloudflare/workers-sdk/commit/823cba8e51fa6840f50dd949bcfa967ff6fefc37) Thanks [@vicb](https://github.com/vicb)! - wrangler and vite-plugin now depend upon the latest version of unenv-preset

- Updated dependencies [[`c5b291d`](https://github.com/cloudflare/workers-sdk/commit/c5b291d3b7a334253aef0593759a59deb0ae4a89), [`3d4f946`](https://github.com/cloudflare/workers-sdk/commit/3d4f94648bdc9edc6260c0f090d2ae665d45a495), [`7245101`](https://github.com/cloudflare/workers-sdk/commit/7245101d5aa815d2c258a301f86dbab77f543b60), [`823cba8`](https://github.com/cloudflare/workers-sdk/commit/823cba8e51fa6840f50dd949bcfa967ff6fefc37), [`19794bf`](https://github.com/cloudflare/workers-sdk/commit/19794bfb57a3ab17433eefbe1820d21d98bc32a4), [`154acf7`](https://github.com/cloudflare/workers-sdk/commit/154acf72c653134ace47174c18e77c9d51effa89), [`19794bf`](https://github.com/cloudflare/workers-sdk/commit/19794bfb57a3ab17433eefbe1820d21d98bc32a4), [`7fb0bfd`](https://github.com/cloudflare/workers-sdk/commit/7fb0bfdc8438d1a1e0a967ab178952da9787c012), [`059a39e`](https://github.com/cloudflare/workers-sdk/commit/059a39e4f1e9f9b55ed8a5a8598e35af9bd0357f)]:
  - wrangler@4.26.0
  - @cloudflare/unenv-preset@2.4.1
  - miniflare@4.20250712.2

## 1.10.0

### Minor Changes

- [#10001](https://github.com/cloudflare/workers-sdk/pull/10001) [`5796ca9`](https://github.com/cloudflare/workers-sdk/commit/5796ca979b09ce89d0f819a312f3ca21a5c7347e) Thanks [@jamesopstad](https://github.com/jamesopstad)! - We now automatically inject the following HMR code into your Worker entry file:

  ```ts
  if (import.meta.hot) {
  	import.meta.hot.accept();
  }
  ```

  This prevents file changes from invalidating the full module graph and improves HMR performance in development.

### Patch Changes

- [#10038](https://github.com/cloudflare/workers-sdk/pull/10038) [`a355327`](https://github.com/cloudflare/workers-sdk/commit/a3553276f8cd4eb520dc872a56c20b6e329493c7) Thanks [@emily-shen](https://github.com/emily-shen)! - Resolve `containers.image` (if it is a path to a Dockerfile) to an absolute path in the deploy config.

- [#9891](https://github.com/cloudflare/workers-sdk/pull/9891) [`dd416e9`](https://github.com/cloudflare/workers-sdk/commit/dd416e93afbc52d869fd154899d260bfc04fc493) Thanks [@hi-ogawa](https://github.com/hi-ogawa)! - set `build.rollupOptions.platform: "neutral"` on rolldown-vite to prevent Rolldown's `node:module` based `require` polyfill from breaking the build.

- [#9819](https://github.com/cloudflare/workers-sdk/pull/9819) [`0c4008c`](https://github.com/cloudflare/workers-sdk/commit/0c4008ce183c82ebff8eac2469ff9a8256cffa5f) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat(vite-plugin): Add containers support in `vite dev`

  Adds support for Cloudflare Containers in `vite dev`. Please note that at the time of this PR a container image can only specify the path to a `Dockerfile`. Support for registry links will be added in a later version, as will containers support in `vite preview`.

- Updated dependencies [[`189fe23`](https://github.com/cloudflare/workers-sdk/commit/189fe23830373e75c881481939665384c18246dc), [`c02b067`](https://github.com/cloudflare/workers-sdk/commit/c02b067fc0a21d92b5c22bd744f2daf263906e50), [`7e5585d`](https://github.com/cloudflare/workers-sdk/commit/7e5585dbf844fda0e1688797ce31c7e634f3f4ba), [`b0217f9`](https://github.com/cloudflare/workers-sdk/commit/b0217f965cf97a71bf7391628bdb15dc69663dcb), [`e87198a`](https://github.com/cloudflare/workers-sdk/commit/e87198a6f43a52ff3b1509e99023932e62de97fe), [`ad02ad3`](https://github.com/cloudflare/workers-sdk/commit/ad02ad3dfc151ed6ec016222dd42b9e99fe32ca0), [`0c4008c`](https://github.com/cloudflare/workers-sdk/commit/0c4008ce183c82ebff8eac2469ff9a8256cffa5f)]:
  - @cloudflare/unenv-preset@2.4.0
  - wrangler@4.25.1
  - miniflare@4.20250712.1

## 1.9.6

### Patch Changes

- Updated dependencies [[`6cc24c0`](https://github.com/cloudflare/workers-sdk/commit/6cc24c08148e7b9d6747ab66dc826df850fb0a7c), [`9f0c175`](https://github.com/cloudflare/workers-sdk/commit/9f0c175ab668217f78debab4dfdb3e677040b9b0)]:
  - wrangler@4.25.0

## 1.9.5

### Patch Changes

- [#9847](https://github.com/cloudflare/workers-sdk/pull/9847) [`14ce577`](https://github.com/cloudflare/workers-sdk/commit/14ce5775c775b32bc1166d4e7a1546a00c049ab0) Thanks [@penalosa](https://github.com/penalosa)! - Upgrade Undici

- Updated dependencies [[`ac08e68`](https://github.com/cloudflare/workers-sdk/commit/ac08e6886a10c7cff4cf02002dffe961f5f157b9), [`4ba9f25`](https://github.com/cloudflare/workers-sdk/commit/4ba9f251d7793fb934a16a96a04d8bb3ac0893b1), [`17b1e5a`](https://github.com/cloudflare/workers-sdk/commit/17b1e5af8fe54cf9ad942278d860cd88eb2a2ebd), [`3bb69fa`](https://github.com/cloudflare/workers-sdk/commit/3bb69fae168a7254c0eb396ea90cc274d0d9ce92), [`274a826`](https://github.com/cloudflare/workers-sdk/commit/274a826b3349211e8722baab2d73cdaab3b3aa5d), [`77d1cb2`](https://github.com/cloudflare/workers-sdk/commit/77d1cb23761e258720956c0d5d72fb778cf80d42), [`d6a1b9b`](https://github.com/cloudflare/workers-sdk/commit/d6a1b9b21a4fb37804b5408b6f3f80e50a774a7f), [`e2672c5`](https://github.com/cloudflare/workers-sdk/commit/e2672c5fdb706dff2b0846c09fa8091146d41ef9), [`a5d7b35`](https://github.com/cloudflare/workers-sdk/commit/a5d7b35c821500732638b8bdb54f4e72d187e665), [`5b0fc9e`](https://github.com/cloudflare/workers-sdk/commit/5b0fc9e96b97e935fa8e60ba442a9d706753ebd4), [`bf4c9ab`](https://github.com/cloudflare/workers-sdk/commit/bf4c9abda7ec70f8633884987db36be2cf1b7e1e), [`14ce577`](https://github.com/cloudflare/workers-sdk/commit/14ce5775c775b32bc1166d4e7a1546a00c049ab0), [`f73da0d`](https://github.com/cloudflare/workers-sdk/commit/f73da0de07b584c3f741f08a1f7e29ee2be9f223)]:
  - miniflare@4.20250712.0
  - wrangler@4.24.4

## 1.9.4

### Patch Changes

- Updated dependencies [[`c01c4ee`](https://github.com/cloudflare/workers-sdk/commit/c01c4ee6affd0acf2f678d9c562f4a7d6db82465), [`3743896`](https://github.com/cloudflare/workers-sdk/commit/3743896120baa530c1b6d4cb7eeda27847b2db44)]:
  - wrangler@4.24.3
  - miniflare@4.20250709.0

## 1.9.3

### Patch Changes

- Updated dependencies [[`80cc834`](https://github.com/cloudflare/workers-sdk/commit/80cc83403e2adb6e989455ba28743f282c5509c8)]:
  - wrangler@4.24.2

## 1.9.2

### Patch Changes

- Updated dependencies [[`05adc61`](https://github.com/cloudflare/workers-sdk/commit/05adc615c97df5174dd6c85b06cf40ec12ffe404), [`bb09e50`](https://github.com/cloudflare/workers-sdk/commit/bb09e50d8e7f823172f3e492ca111157a105adb1), [`25dbe54`](https://github.com/cloudflare/workers-sdk/commit/25dbe5480dd1d14ee25b38fc5e0105f938b1ee5b), [`3bdec6b`](https://github.com/cloudflare/workers-sdk/commit/3bdec6b768a0b68560ad6d24274007de3a7fbc26)]:
  - wrangler@4.24.1
  - miniflare@4.20250709.0

## 1.9.1

### Patch Changes

- [#9856](https://github.com/cloudflare/workers-sdk/pull/9856) [`8bf60a7`](https://github.com/cloudflare/workers-sdk/commit/8bf60a73cb12a5f7b8041f72c980dbd1868fb1a3) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Set the Wrangler peer dependency to the same version as the direct dependency. This fixes an issue where older versions of Wrangler could override the version used by the plugin.

- Updated dependencies [[`1b3a2b7`](https://github.com/cloudflare/workers-sdk/commit/1b3a2b71b7daedb367ba89af8792e48c43e72c59), [`dbfa4ef`](https://github.com/cloudflare/workers-sdk/commit/dbfa4ef4d48a119dd54c16cc4069ac11478cfe0c), [`ba69586`](https://github.com/cloudflare/workers-sdk/commit/ba69586d8f8ad5ea68e42e4feb47994f4503c376), [`1a75f85`](https://github.com/cloudflare/workers-sdk/commit/1a75f85ae9893bd0ee8c8dba77d4d1be104a527c), [`395f36d`](https://github.com/cloudflare/workers-sdk/commit/395f36de127c6ee5fbc0ceadbfb508f7f32f5388), [`6f344bf`](https://github.com/cloudflare/workers-sdk/commit/6f344bfe3179477a75c61d504bf69ede05d103ab), [`fc29c31`](https://github.com/cloudflare/workers-sdk/commit/fc29c31ae025ea147be059ee6cb7bf198fb9f313), [`45497ab`](https://github.com/cloudflare/workers-sdk/commit/45497ab4a4255f70f445e8487b648ad7a55328f3), [`a447d67`](https://github.com/cloudflare/workers-sdk/commit/a447d6722a9eedca21d8c888db47954a9d81f906), [`7c55f9e`](https://github.com/cloudflare/workers-sdk/commit/7c55f9e1eac4fb0d53f9180a011172328296be16), [`49c85c5`](https://github.com/cloudflare/workers-sdk/commit/49c85c5306b3dbfa9342baeab3b7d14d954d4ade), [`0bb619a`](https://github.com/cloudflare/workers-sdk/commit/0bb619a92911415957d8788923302c15364638c9), [`a1181bf`](https://github.com/cloudflare/workers-sdk/commit/a1181bf804e3ee4b6c2034fa3e429fd6b71f4c13), [`a727db3`](https://github.com/cloudflare/workers-sdk/commit/a727db341a811572623e0a0f361f070a95758776), [`1358034`](https://github.com/cloudflare/workers-sdk/commit/1358034ec2641118dd366a7b1b862dbb623ddf28), [`1a58bc3`](https://github.com/cloudflare/workers-sdk/commit/1a58bc34d6ffa62fbcb9e8e15ebf61dcfd288659), [`7e3aa1b`](https://github.com/cloudflare/workers-sdk/commit/7e3aa1b774dfb971c2d22d5c054206b6f7542b39)]:
  - wrangler@4.24.0
  - miniflare@4.20250705.0

## 1.9.0

### Minor Changes

- [#9535](https://github.com/cloudflare/workers-sdk/pull/9535) [`56dc5c4`](https://github.com/cloudflare/workers-sdk/commit/56dc5c4946417df12688dd6b2374835f60c14be6) Thanks [@penalosa](https://github.com/penalosa)! - In 2023 we announced [breakpoint debugging support](https://blog.cloudflare.com/debugging-cloudflare-workers/) for Workers, which meant that you could easily debug your Worker code in Wrangler's built-in devtools (accessible via the `[d]` hotkey) as well as multiple other devtools clients, [including VSCode](https://developers.cloudflare.com/workers/observability/dev-tools/breakpoints/). For most developers, breakpoint debugging via VSCode is the most natural flow, but until now it's required [manually configuring a `launch.json` file](https://developers.cloudflare.com/workers/observability/dev-tools/breakpoints/#setup-vs-code-to-use-breakpoints), running `wrangler dev`, and connecting via VSCode's built-in debugger.

  Now, using VSCode's built-in [JavaScript Debug Terminals](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_javascript-debug-terminal), there are just two steps: open a JS debug terminal and run `vite dev` or `vite preview`. VSCode will automatically connect to your running Worker (even if you're running multiple Workers at once!) and start a debugging session.

- [#9803](https://github.com/cloudflare/workers-sdk/pull/9803) [`df04528`](https://github.com/cloudflare/workers-sdk/commit/df0452892dc85133c557c4daff68508d7fdee77a) Thanks [@penalosa](https://github.com/penalosa)! - Support Workers Analytics Engine & Rate Limiting bindings

### Patch Changes

- Updated dependencies [[`56dc5c4`](https://github.com/cloudflare/workers-sdk/commit/56dc5c4946417df12688dd6b2374835f60c14be6), [`8acaf43`](https://github.com/cloudflare/workers-sdk/commit/8acaf432ac3e6988be49d68060f5abab2b9a6e0d), [`4309bb3`](https://github.com/cloudflare/workers-sdk/commit/4309bb30d2baa5fd410e250602d10247102b9885), [`d11288a`](https://github.com/cloudflare/workers-sdk/commit/d11288aff5a11db92b153b4422d77a863a8869a0)]:
  - miniflare@4.20250617.5
  - wrangler@4.23.0

## 1.8.0

### Minor Changes

- [#9773](https://github.com/cloudflare/workers-sdk/pull/9773) [`45e97e8`](https://github.com/cloudflare/workers-sdk/commit/45e97e876ae7a9d0ef50e8e51c07cfcb234b4ab6) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Vite 7 is now supported and included as a peer dependency. We continue to also support Vite 6.

- [#9753](https://github.com/cloudflare/workers-sdk/pull/9753) [`67130b3`](https://github.com/cloudflare/workers-sdk/commit/67130b3c5eebb8634641879ff4a2ff9f57581834) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Allow `optimizeDeps.exclude` to be specified for Worker environments. This enables other plugins to exclude dependencies from optimization that require access to virtual modules. Note that excluded dependencies must be ESM.

## 1.7.5

### Patch Changes

- Updated dependencies [[`9c938c2`](https://github.com/cloudflare/workers-sdk/commit/9c938c2183e868b6468ad7a2298a74aa01d40f3c), [`fb83341`](https://github.com/cloudflare/workers-sdk/commit/fb83341bed6ff6571519eb117db19e3e76a83215), [`b137a6f`](https://github.com/cloudflare/workers-sdk/commit/b137a6f090b952f7e34236fa86b6667ca895f601), [`29e911a`](https://github.com/cloudflare/workers-sdk/commit/29e911abbbd12385aec201cb9589cccd832fb400), [`f3c5791`](https://github.com/cloudflare/workers-sdk/commit/f3c5791e3abf0b4468ff2a97046fed3e44b2fa4e)]:
  - wrangler@4.21.1
  - miniflare@4.20250617.4

## 1.7.4

### Patch Changes

- Updated dependencies [[`086e29d`](https://github.com/cloudflare/workers-sdk/commit/086e29daf4c2ad5e3b7b9217b11e2447945bf8c8), [`d5edf52`](https://github.com/cloudflare/workers-sdk/commit/d5edf52b4391c8cf1efe2ba8ae8cdb3edbf3daa3), [`bfb791e`](https://github.com/cloudflare/workers-sdk/commit/bfb791e708706c643d088864a5226b23b0f45d7e), [`24b2c66`](https://github.com/cloudflare/workers-sdk/commit/24b2c666cf07e83c00c49d13f2fe1bd98e602514), [`3f478af`](https://github.com/cloudflare/workers-sdk/commit/3f478af7f124c221c5a6bee6853aff818cb55ecc), [`5162c51`](https://github.com/cloudflare/workers-sdk/commit/5162c5194604f26b2e5018961b761f3450872333)]:
  - wrangler@4.20.5
  - miniflare@4.20250617.3

## 1.7.3

### Patch Changes

- [#9647](https://github.com/cloudflare/workers-sdk/pull/9647) [`6c6afbd`](https://github.com/cloudflare/workers-sdk/commit/6c6afbd6072b96e78e67d3a863ed849c6aa49472) Thanks [@jamesopstad](https://github.com/jamesopstad)! - In Vite 7, the `applyToEnvironment` hook is called in preview mode. This is now accounted for to ensure compatibility.

- Updated dependencies [[`ffa742f`](https://github.com/cloudflare/workers-sdk/commit/ffa742f32f71cf77a9a451a557c7dc677fad6682), [`8a60fe7`](https://github.com/cloudflare/workers-sdk/commit/8a60fe76ec5ecc734c0eb9f31b4d60e86d5cb06d), [`c489a44`](https://github.com/cloudflare/workers-sdk/commit/c489a44847cf820ec0e1a7f8a9e626bf522d4829), [`8a60fe7`](https://github.com/cloudflare/workers-sdk/commit/8a60fe76ec5ecc734c0eb9f31b4d60e86d5cb06d), [`17d23d8`](https://github.com/cloudflare/workers-sdk/commit/17d23d8e5fd54737d1c4b9cb487fd6e85cddc9c8)]:
  - wrangler@4.20.4
  - miniflare@4.20250617.2

## 1.7.2

### Patch Changes

- [#9586](https://github.com/cloudflare/workers-sdk/pull/9586) [`d1d34fe`](https://github.com/cloudflare/workers-sdk/commit/d1d34fedd1276803223830b8d6670c1b21e72308) Thanks [@penalosa](https://github.com/penalosa)! - Remove the Mixed Mode naming in favour of "remote bindings"/"remote proxy"

- Updated dependencies [[`08be3ed`](https://github.com/cloudflare/workers-sdk/commit/08be3ed057aad1af8c5a067c57fcbe5896e246b0), [`d1d34fe`](https://github.com/cloudflare/workers-sdk/commit/d1d34fedd1276803223830b8d6670c1b21e72308)]:
  - wrangler@4.20.3
  - miniflare@4.20250617.1

## 1.7.1

### Patch Changes

- Updated dependencies [[`828b7df`](https://github.com/cloudflare/workers-sdk/commit/828b7dffada8c4b5ea77d3ccddb923815c19671d), [`b1c9139`](https://github.com/cloudflare/workers-sdk/commit/b1c91395246677a0d9ce8cca549569040302b04b), [`92f12f4`](https://github.com/cloudflare/workers-sdk/commit/92f12f442d752aad132fd2f5acdad26abd99694e), [`2671e77`](https://github.com/cloudflare/workers-sdk/commit/2671e778435b9e3380c0d34718824409be494c33)]:
  - miniflare@4.20250617.0
  - wrangler@4.20.2

## 1.7.0

### Minor Changes

- [#9575](https://github.com/cloudflare/workers-sdk/pull/9575) [`5601fc3`](https://github.com/cloudflare/workers-sdk/commit/5601fc32f8cb7b4867eb758f77590fa70f0a4b4f) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support `run_worker_first`.

  `run_worker_first` has been expanded to accept an array of routes that should go directly to your Worker. Additionally, routes can be omitted by adding a `!` prefix. These negative routes will be treated as assets.

  This is a new way to define routing explicitly and, when provided, overrides the implicit routing behavior.

  ```jsonc
  {
  	"assets": {
  		"not_found_handling": "single-page-application",
  		"run_worker_first": [
  			"/api/*", // These routes go directly to the Worker
  			"!/api/docs/*", // These routes are still treated as assets
  		],
  	},
  }
  ```

  The previous behavior of setting `"run_worker_first": true` to always invoke your Worker is also now supported.

### Patch Changes

- [#9583](https://github.com/cloudflare/workers-sdk/pull/9583) [`70ba9fb`](https://github.com/cloudflare/workers-sdk/commit/70ba9fbf905a9ba5fe158d0bc8d48f6bf31712a2) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: avoid crashing on unknown service bindings at startup

  With Dev Registry support, the plugin no longer throws an assertion error during startup when a service binding references a named entrypoint from an unknown worker. Instead, an appropriate runtime error will be returned if the worker cannot be resolved.

- [#9548](https://github.com/cloudflare/workers-sdk/pull/9548) [`0174e39`](https://github.com/cloudflare/workers-sdk/commit/0174e3996e393080abfb28226ce1ad1e7d5d8e50) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Enable HTML handling for HTML files in the public directory.

  It is generally encouraged to use [HTML files as entry points](https://vite.dev/guide/features#html) in Vite so that their dependencies are bundled. However, if you have plain HTML files that should simply be copied to the root of the output directory as-is, you can place these in the [public directory](https://vite.dev/guide/assets#the-public-directory) and they will now work as expected in dev.

- [#9566](https://github.com/cloudflare/workers-sdk/pull/9566) [`521eeb9`](https://github.com/cloudflare/workers-sdk/commit/521eeb9d7db1da5aae7a1c215d540184f6457301) Thanks [@vicb](https://github.com/vicb)! - Bump `@cloudflare/unenv-preset` to 2.3.3

- [#9581](https://github.com/cloudflare/workers-sdk/pull/9581) [`6bc0a2f`](https://github.com/cloudflare/workers-sdk/commit/6bc0a2f288b63613b29658be239996b66beb908a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that globals are polyfilled before every import

- [#9536](https://github.com/cloudflare/workers-sdk/pull/9536) [`3b61c41`](https://github.com/cloudflare/workers-sdk/commit/3b61c41f2c9e98ff023d21d79676d6f9981e52f8) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - performance improvement: restart a mixed mode session only if the worker's remote bindings have changed

- Updated dependencies [[`3b61c41`](https://github.com/cloudflare/workers-sdk/commit/3b61c41f2c9e98ff023d21d79676d6f9981e52f8), [`bd528d5`](https://github.com/cloudflare/workers-sdk/commit/bd528d5d53a473b8339574290da0c47797c3b322), [`2177fb4`](https://github.com/cloudflare/workers-sdk/commit/2177fb44f43357d349ff2e2cc4b40d72c929e491), [`1d3293f`](https://github.com/cloudflare/workers-sdk/commit/1d3293f0cbf88a45d7b86bae0fc886e08aa6e841), [`04f9164`](https://github.com/cloudflare/workers-sdk/commit/04f9164bbcea528f9a4075bef47e8edf4cd22ae8), [`36113c2`](https://github.com/cloudflare/workers-sdk/commit/36113c29c8d2338fcd7a6da19f4c59c7e9f65a3b), [`49f5ac7`](https://github.com/cloudflare/workers-sdk/commit/49f5ac7ef2ff041897a56aec6607616689ca87a5), [`cf33417`](https://github.com/cloudflare/workers-sdk/commit/cf33417320109bc405b105818bf759916b51d2d0), [`521eeb9`](https://github.com/cloudflare/workers-sdk/commit/521eeb9d7db1da5aae7a1c215d540184f6457301), [`02e2c1e`](https://github.com/cloudflare/workers-sdk/commit/02e2c1e4dec0a7026c49bf6ab0b3da1f0ddfedd5), [`02e2c1e`](https://github.com/cloudflare/workers-sdk/commit/02e2c1e4dec0a7026c49bf6ab0b3da1f0ddfedd5), [`3b61c41`](https://github.com/cloudflare/workers-sdk/commit/3b61c41f2c9e98ff023d21d79676d6f9981e52f8), [`e16fcc7`](https://github.com/cloudflare/workers-sdk/commit/e16fcc747aa7701405eb4f49a73e622425f67527), [`c117904`](https://github.com/cloudflare/workers-sdk/commit/c11790486fc1a5c7c907f5757779b3b8eba29013), [`fae8c02`](https://github.com/cloudflare/workers-sdk/commit/fae8c02bcfb51cb87a01a5185b249f6c5889d0a6)]:
  - wrangler@4.20.1
  - miniflare@4.20250612.0

## 1.6.0

### Minor Changes

- [#9510](https://github.com/cloudflare/workers-sdk/pull/9510) [`590d69b`](https://github.com/cloudflare/workers-sdk/commit/590d69b7b46954947d0b3f9dacd7da7417e736b7) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Enhanced build support for Workers with assets.

  Assets that are imported in the entry Worker are now automatically moved to the client build output. This enables importing assets in your Worker and accessing them via the [assets binding](https://developers.cloudflare.com/workers/static-assets/binding/#binding). See [Static Asset Handling](https://vite.dev/guide/assets) to find out about all the ways you can import assets in Vite.

  Additionally, a broader range of build scenarios are now supported. These are:

  - Assets only build with client entry/entries
  - Assets only build with no client entry/entries that includes `public` directory assets
  - Worker(s) + assets build with client entry/entries
  - Worker(s) + assets build with no client entry/entries that includes imported and/or `public` directory assets
  - Worker(s) build with no assets

### Patch Changes

- [#9513](https://github.com/cloudflare/workers-sdk/pull/9513) [`0e50072`](https://github.com/cloudflare/workers-sdk/commit/0e500720bf70016fa4ea21fc8959c4bd764ebc38) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Ensure that .dev.vars files cannot be accessed via the dev server or preview server.

- Updated dependencies [[`1914b87`](https://github.com/cloudflare/workers-sdk/commit/1914b87e254bb733298cb0c0e96bb0bd234acde4), [`931f467`](https://github.com/cloudflare/workers-sdk/commit/931f467e39f70abfd0e1c08172f330e6e3de02a3), [`95eb47d`](https://github.com/cloudflare/workers-sdk/commit/95eb47d2c6adcff9a475c0cd507a72bd2e83f3b1), [`80b8bd9`](https://github.com/cloudflare/workers-sdk/commit/80b8bd93e6dd931a7b216645a6f249642c420dee), [`95eb47d`](https://github.com/cloudflare/workers-sdk/commit/95eb47d2c6adcff9a475c0cd507a72bd2e83f3b1), [`9e4cd16`](https://github.com/cloudflare/workers-sdk/commit/9e4cd16ce1639cc6763f5c50b9478eece7f4be73), [`92305af`](https://github.com/cloudflare/workers-sdk/commit/92305af0a7efa68fc0e13e3549f88d19f3cb069b), [`0b2ba45`](https://github.com/cloudflare/workers-sdk/commit/0b2ba4590ca59f1d95d7262e64adeefebe6a3e7e)]:
  - wrangler@4.20.0
  - miniflare@4.20250604.1
  - @cloudflare/unenv-preset@2.3.3

## 1.5.1

### Patch Changes

- Updated dependencies [[`4ab5a40`](https://github.com/cloudflare/workers-sdk/commit/4ab5a4027d8a180e8ed300bc63d4d4d41848bcd5), [`485cd08`](https://github.com/cloudflare/workers-sdk/commit/485cd08679eaa3a47e9951c708b80f5c33a0a097), [`66edd2f`](https://github.com/cloudflare/workers-sdk/commit/66edd2f3bdae3a5fa437311a038a47aba366a64c), [`d1a1787`](https://github.com/cloudflare/workers-sdk/commit/d1a1787b27467417830f5d5c7bb8e7a14d346e9c), [`e3b3ef5`](https://github.com/cloudflare/workers-sdk/commit/e3b3ef51cfbdb5ffa15ebe81656460c340a2bba4), [`1f84092`](https://github.com/cloudflare/workers-sdk/commit/1f84092851e7a71681e99417cfd63c982bfa1d58), [`3261957`](https://github.com/cloudflare/workers-sdk/commit/3261957aba6bd8c02014206ad6fa219badde4a35)]:
  - miniflare@4.20250604.0
  - wrangler@4.19.2
  - @cloudflare/unenv-preset@2.3.3

## 1.5.0

### Minor Changes

- [#9341](https://github.com/cloudflare/workers-sdk/pull/9341) [`2cef3ab`](https://github.com/cloudflare/workers-sdk/commit/2cef3ab4f9c3c24c3e85d61967ce7dd9a4423ea4) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support loading all asset types via assets binding. Previously only HTML assets could be loaded via the assets binding. The binding now integrates with Vite's internal middleware to load all asset types.

### Patch Changes

- Updated dependencies [[`db2cdc6`](https://github.com/cloudflare/workers-sdk/commit/db2cdc6b1e77473762d0b4fcbad8e50ae2fe712c)]:
  - wrangler@4.19.1

## 1.4.0

### Minor Changes

- [#9173](https://github.com/cloudflare/workers-sdk/pull/9173) [`fac2f9d`](https://github.com/cloudflare/workers-sdk/commit/fac2f9dfa67b9c9b3ab0979acbb79f8e020a9cfb) Thanks [@edmundhung](https://github.com/edmundhung)! - Enable cross-process Service bindings and Tail workers with the Dev Registry

  You can now run workers in separate dev sessions—whether `vite dev` or `wrangler dev`—and they’ll automatically discover and connect to each other:

  **Worker A**

  ```jsonc
  // ./worker-a/wrangler.jsonc
  {
  	"name": "worker-a",
  	"main": "./src/index.ts",
  	"services": [
  		{
  			"binding": "SERVICE",
  			"service": "worker-b",
  		},
  	],
  }
  ```

  **Worker B**

  ```jsonc
  // ./worker-b/wrangler.jsonc
  {
  	"name": "worker-b",
  	"main": "./src/index.ts",
  	"tail_consumers": [
  		{
  			"service": "worker-a",
  		},
  	],
  }
  ```

  Then run both workers in separate terminals:

  ```sh
  # Terminal 1
  cd worker-a
  vite dev

  # Terminal 2
  cd worker-b
  vite dev
  # or `wrangler dev` if you prefer
  ```

  That's it!

### Patch Changes

- [#9410](https://github.com/cloudflare/workers-sdk/pull/9410) [`87f3843`](https://github.com/cloudflare/workers-sdk/commit/87f38432ee25aa57efce394baed5712484e3202e) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - silence `remote` wrangler config warnings when mixed mode is enabled

- Updated dependencies [[`03b8c1c`](https://github.com/cloudflare/workers-sdk/commit/03b8c1ca535a5198ee69001243f6ff3e7b6dac13), [`8c7ce77`](https://github.com/cloudflare/workers-sdk/commit/8c7ce7728ccc467aa19b60c8f32c90e6f06442d1), [`80e75f4`](https://github.com/cloudflare/workers-sdk/commit/80e75f4a67b4e4b7a1bc92e0a93659e5d6f141dc), [`80e75f4`](https://github.com/cloudflare/workers-sdk/commit/80e75f4a67b4e4b7a1bc92e0a93659e5d6f141dc), [`b3be057`](https://github.com/cloudflare/workers-sdk/commit/b3be05734456852eb06dc573634b358569e65876), [`87f3843`](https://github.com/cloudflare/workers-sdk/commit/87f38432ee25aa57efce394baed5712484e3202e), [`fac2f9d`](https://github.com/cloudflare/workers-sdk/commit/fac2f9dfa67b9c9b3ab0979acbb79f8e020a9cfb), [`92719a5`](https://github.com/cloudflare/workers-sdk/commit/92719a535bf6bae9d660a05d5c8f8823004929c5)]:
  - wrangler@4.19.0
  - miniflare@4.20250525.1

## 1.3.1

### Patch Changes

- [#9387](https://github.com/cloudflare/workers-sdk/pull/9387) [`e39a45f`](https://github.com/cloudflare/workers-sdk/commit/e39a45ffa0d783cc99107f8ab02d6b3dd27d4c9f) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Prevent leaking Miniflare server logs. Logs that were previously filtered were leaking as they were changed to include colors. We now override the new Miniflare `Log.logReady` method with a noop rather than filtering the logs.

- [#9308](https://github.com/cloudflare/workers-sdk/pull/9308) [`d3a6eb3`](https://github.com/cloudflare/workers-sdk/commit/d3a6eb30e58de2b8f12fc899a70a31518968b910) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add new `mixedMode` experimental option

  Add a new `mixedMode` experimental option that allows uses to have their worker access remote resources during development (and preview)

  To enabled mixed mode set the corresponding option to the cloudflare plugin instantiation:

  ```js
  export default defineConfig({
  	plugins: [
  		cloudflare({
  			// ...
  			experimental: { mixedMode: true },
  		}),
  	],
  });
  ```

  Thereafter bindings configured with the `remote` flags will be accessible by workers' code when run via `vite dev` and `vite preview`

- Updated dependencies [[`34b6174`](https://github.com/cloudflare/workers-sdk/commit/34b61746f26be5b4521eaf10bd29ac8792adcf08), [`d9d937a`](https://github.com/cloudflare/workers-sdk/commit/d9d937ab6f2868271dde5a8da625773085eaec85), [`e39a45f`](https://github.com/cloudflare/workers-sdk/commit/e39a45ffa0d783cc99107f8ab02d6b3dd27d4c9f), [`d3a6eb3`](https://github.com/cloudflare/workers-sdk/commit/d3a6eb30e58de2b8f12fc899a70a31518968b910), [`b8f058c`](https://github.com/cloudflare/workers-sdk/commit/b8f058c81ecf122c80069b655d92232eb1302fd1), [`fdae3f7`](https://github.com/cloudflare/workers-sdk/commit/fdae3f7665a5cd3b5e25c9de19156ecd54618a7c)]:
  - wrangler@4.18.0
  - miniflare@4.20250525.0

## 1.3.0

### Minor Changes

- [#9330](https://github.com/cloudflare/workers-sdk/pull/9330) [`34c71ce`](https://github.com/cloudflare/workers-sdk/commit/34c71ce9208ffceefe718fc9ae7282ef95e2f2be) Thanks [@edmundhung](https://github.com/edmundhung)! - Updated internal configuration to use Miniflare’s new `defaultPersistRoot` instead of per-plugin `persist` flags

### Patch Changes

- Updated dependencies [[`34c71ce`](https://github.com/cloudflare/workers-sdk/commit/34c71ce9208ffceefe718fc9ae7282ef95e2f2be), [`f7c82a4`](https://github.com/cloudflare/workers-sdk/commit/f7c82a4a9f1cb1c9abf6d309327a72b5423e44b1), [`7ddd865`](https://github.com/cloudflare/workers-sdk/commit/7ddd865fa61b65851149e3d1ac8753002b648e65), [`6479fc5`](https://github.com/cloudflare/workers-sdk/commit/6479fc5228d1249e87c7f668e8efbf88ec5a8f5f), [`410d985`](https://github.com/cloudflare/workers-sdk/commit/410d9852508f94e33fbe30095fe0c421636f033e), [`e5ae13a`](https://github.com/cloudflare/workers-sdk/commit/e5ae13adebe5ee139cf2c91f0a3bd5992cfd3923), [`6c03bde`](https://github.com/cloudflare/workers-sdk/commit/6c03bde33ffc9607577e5e7540f7178396d9e32d), [`c2678d1`](https://github.com/cloudflare/workers-sdk/commit/c2678d168185bc75ed724edc4ee7615f6f1e0f87), [`34c71ce`](https://github.com/cloudflare/workers-sdk/commit/34c71ce9208ffceefe718fc9ae7282ef95e2f2be), [`cc7fae4`](https://github.com/cloudflare/workers-sdk/commit/cc7fae4cb9a2b69afd1c850a4562f819d0abf4e7)]:
  - miniflare@4.20250523.0
  - wrangler@4.17.0

## 1.2.4

### Patch Changes

- [#9322](https://github.com/cloudflare/workers-sdk/pull/9322) [`1bae861`](https://github.com/cloudflare/workers-sdk/commit/1bae8618bc03042c950c3c5f0d259dda2f4bcbfe) Thanks [@justinvdm](https://github.com/justinvdm)! - Fix regex to correctly detect additional module imports with \_\_ in path

- Updated dependencies [[`7344344`](https://github.com/cloudflare/workers-sdk/commit/734434418fa9a3826a3568e5890e396452afcefe)]:
  - wrangler@4.16.1

## 1.2.3

### Patch Changes

- [#9221](https://github.com/cloudflare/workers-sdk/pull/9221) [`2ef31a9`](https://github.com/cloudflare/workers-sdk/commit/2ef31a94596ad33c9f0adf9045a515fdb8e2cd38) Thanks [@vicb](https://github.com/vicb)! - bump `@cloudflare/unenv-preset`

- Updated dependencies [[`2fe6219`](https://github.com/cloudflare/workers-sdk/commit/2fe62198d75522e037c093b4f162ec6aeabea4ee), [`66d975e`](https://github.com/cloudflare/workers-sdk/commit/66d975e90599197ce0fe24288dbc9a03ecce3b5a), [`5ab035d`](https://github.com/cloudflare/workers-sdk/commit/5ab035d8a133728e24069e6cc6c317d28ea7fe17), [`02d40ed`](https://github.com/cloudflare/workers-sdk/commit/02d40ed3bbfc9cb4c2f95fb921efd7ec56f141a6), [`2ef31a9`](https://github.com/cloudflare/workers-sdk/commit/2ef31a94596ad33c9f0adf9045a515fdb8e2cd38), [`db5ea8f`](https://github.com/cloudflare/workers-sdk/commit/db5ea8f1f657c29edd62becb839a6e010324d5fb), [`f2a16f1`](https://github.com/cloudflare/workers-sdk/commit/f2a16f112637c111393d1a771ab63679d2b3f54f), [`3b8f7f1`](https://github.com/cloudflare/workers-sdk/commit/3b8f7f18bee09d6a110022da97ea9eb08ab02c28), [`16de0d5`](https://github.com/cloudflare/workers-sdk/commit/16de0d5227876a5bb83dbf3289d9b2a71719064f), [`b87b472`](https://github.com/cloudflare/workers-sdk/commit/b87b472a1a06419c1ded539fa478fa69a688efba)]:
  - wrangler@4.16.0
  - miniflare@4.20250508.3

## 1.2.2

### Patch Changes

- Updated dependencies [[`33daa09`](https://github.com/cloudflare/workers-sdk/commit/33daa0961fd8ae06ff9138dc63cb320dc934bf55), [`3b384e2`](https://github.com/cloudflare/workers-sdk/commit/3b384e28c7b2c2be1bf959831ad538c56f2a8c8a)]:
  - wrangler@4.15.2
  - miniflare@4.20250508.2
  - @cloudflare/unenv-preset@2.3.2

## 1.2.1

### Patch Changes

- [#9248](https://github.com/cloudflare/workers-sdk/pull/9248) [`07f4010`](https://github.com/cloudflare/workers-sdk/commit/07f4010e6d2ee74a8af5659da68c68b5ef35400e) Thanks [@vicb](https://github.com/vicb)! - fix unenv version mismatch

- [#9228](https://github.com/cloudflare/workers-sdk/pull/9228) [`0dc7e3c`](https://github.com/cloudflare/workers-sdk/commit/0dc7e3c5ba645b03a09d9ab958d3cc77ac2e08eb) Thanks [@vicb](https://github.com/vicb)! - Bump unenv to 2.0.0-rc.17

- Updated dependencies [[`f61a08e`](https://github.com/cloudflare/workers-sdk/commit/f61a08e311a5aa6b24d56f1901d7fb17b16377b0), [`07f4010`](https://github.com/cloudflare/workers-sdk/commit/07f4010e6d2ee74a8af5659da68c68b5ef35400e), [`ea71df3`](https://github.com/cloudflare/workers-sdk/commit/ea71df3d485cfb37b4585b157ae6b95933b0335f), [`d033a7d`](https://github.com/cloudflare/workers-sdk/commit/d033a7da1c5b918d4e3bd2ea53bc0f0d20817715)]:
  - @cloudflare/unenv-preset@2.3.2
  - wrangler@4.15.1
  - miniflare@4.20250508.1

## 1.2.0

### Minor Changes

- [#9152](https://github.com/cloudflare/workers-sdk/pull/9152) [`dca4163`](https://github.com/cloudflare/workers-sdk/commit/dca41638c93f278eec7d2d7f0b4ee30f024fdc9a) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support HTTPS and HTTP/2. Configuring [`server.https`](https://vite.dev/config/server-options#server-https) and/or [`preview.https`](https://vite.dev/config/preview-options#preview-https) in your Vite config now works as expected. This was previously broken because Undici would add a `transfer-encoding` header for streamed responses. We now remove this header if the request uses HTTP/2.

### Patch Changes

- Updated dependencies [[`6b42c28`](https://github.com/cloudflare/workers-sdk/commit/6b42c28aa42457a64e9342b1cd1f92ad2228ff37), [`37af035`](https://github.com/cloudflare/workers-sdk/commit/37af03518e59a8af9c66c3b50fa380186d2c098b), [`ceeb375`](https://github.com/cloudflare/workers-sdk/commit/ceeb375cac316a6508853511a1ad6ec15d120244), [`53ba97d`](https://github.com/cloudflare/workers-sdk/commit/53ba97df6e42f297b9b40d7635b297f0c7bee65a), [`349cffc`](https://github.com/cloudflare/workers-sdk/commit/349cffcd547e602a4bf3fb708122cf00bb4ad8d2), [`02f0699`](https://github.com/cloudflare/workers-sdk/commit/02f06996e252d77b580241b9abd3fc089672d643), [`91d0c40`](https://github.com/cloudflare/workers-sdk/commit/91d0c408cd47a0c2f9000fdd8232b766de5b1d37), [`362cb0b`](https://github.com/cloudflare/workers-sdk/commit/362cb0be3fa28bbf007491f7156ecb522bd7ee43), [`f6f1a18`](https://github.com/cloudflare/workers-sdk/commit/f6f1a18fc10256d3488785e41002c8867843c6fa), [`415520e`](https://github.com/cloudflare/workers-sdk/commit/415520e769818a858ebf863f42c293a0442440e9), [`63a6504`](https://github.com/cloudflare/workers-sdk/commit/63a65042eb8a9a78d7f07c03eedf4972d88dcf7c), [`2cc8197`](https://github.com/cloudflare/workers-sdk/commit/2cc819782c2ebb0d7f852be719c4230d2a7db6ae), [`6b42c28`](https://github.com/cloudflare/workers-sdk/commit/6b42c28aa42457a64e9342b1cd1f92ad2228ff37), [`f17ee08`](https://github.com/cloudflare/workers-sdk/commit/f17ee08687bad59f1d921fb8da1472b8e92b2c6f)]:
  - wrangler@4.15.0
  - miniflare@4.20250508.0
  - @cloudflare/unenv-preset@2.3.1

## 1.1.1

### Patch Changes

- Updated dependencies [[`df5d1f6`](https://github.com/cloudflare/workers-sdk/commit/df5d1f6104df90e5b991c8d73d9847a64beb9cd2), [`4672bda`](https://github.com/cloudflare/workers-sdk/commit/4672bda9fe0d94a5eaea231fc46ca755092a81eb), [`826c5e8`](https://github.com/cloudflare/workers-sdk/commit/826c5e8df4e5574483ac52f321dba3d6879c8cb8), [`c6b3f10`](https://github.com/cloudflare/workers-sdk/commit/c6b3f10f5adf4e6d62bcc9fe89574a2cbcce3870), [`078c568`](https://github.com/cloudflare/workers-sdk/commit/078c568c2b5746e3c03bc9e1cd5cb7027023107a), [`8c3cdc3`](https://github.com/cloudflare/workers-sdk/commit/8c3cdc34e634bf3dc7ed7aa199ea05d668aed7f6)]:
  - miniflare@4.20250507.0
  - wrangler@4.14.3
  - @cloudflare/unenv-preset@2.3.1

## 1.1.0

### Minor Changes

- [#9108](https://github.com/cloudflare/workers-sdk/pull/9108) [`bb41346`](https://github.com/cloudflare/workers-sdk/commit/bb413469f556423bf70cd3f422a1116f9522ba06) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for running Vite in middleware mode. This enables using Storybook with the Vite plugin, which would previously crash. WebSocket connections to Workers are not supported when in middleware mode.

### Patch Changes

- [#9115](https://github.com/cloudflare/workers-sdk/pull/9115) [`f901e14`](https://github.com/cloudflare/workers-sdk/commit/f901e14e842b57c90729d6f5c2b308f60323aaba) Thanks [@penalosa](https://github.com/penalosa)! - Don't crash on non-existent tail consumers when running `vite dev`

- Updated dependencies [[`cdc88d8`](https://github.com/cloudflare/workers-sdk/commit/cdc88d8fc5ee30d2b3f35b6e548334d5dc68aea1), [`357d42a`](https://github.com/cloudflare/workers-sdk/commit/357d42acfb16d21169d004961030cd4822526a96), [`508a1a3`](https://github.com/cloudflare/workers-sdk/commit/508a1a31a039a5f4700efbc7535a165d79b22cb9), [`82e220e`](https://github.com/cloudflare/workers-sdk/commit/82e220e943521d9f2cbaa63cdb56792da6cb1c60)]:
  - wrangler@4.14.1
  - miniflare@4.20250428.1
  - @cloudflare/unenv-preset@2.3.1

## 1.0.13

### Patch Changes

- Updated dependencies [[`d2ecc76`](https://github.com/cloudflare/workers-sdk/commit/d2ecc763e4d77620d6a9be71855e87893631ebc0), [`9bf55aa`](https://github.com/cloudflare/workers-sdk/commit/9bf55aa60aa69ea9bf2b59138504d1772d84c14d), [`0b4d22a`](https://github.com/cloudflare/workers-sdk/commit/0b4d22a864d7781c87ccead79888b39fd7304575), [`3b60131`](https://github.com/cloudflare/workers-sdk/commit/3b60131ca5a1bafcf7af16b0f41f2601a9a3ee85), [`137d2da`](https://github.com/cloudflare/workers-sdk/commit/137d2da0602db0f66a5c1b6f277624f6031d9dc5)]:
  - miniflare@4.20250428.0
  - wrangler@4.14.0
  - @cloudflare/unenv-preset@2.3.1

## 1.0.12

### Patch Changes

- Updated dependencies [[`2c50115`](https://github.com/cloudflare/workers-sdk/commit/2c501151d3d1a563681cdb300a298b83862b60e2)]:
  - miniflare@4.20250424.1
  - wrangler@4.13.2
  - @cloudflare/unenv-preset@2.3.1

## 1.0.11

### Patch Changes

- [#9039](https://github.com/cloudflare/workers-sdk/pull/9039) [`a9190de`](https://github.com/cloudflare/workers-sdk/commit/a9190de1340dfe43c38fec729e01139f499351dd) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fixes two bugs that were caused by not accounting for an undocumented method on Workers and Durable Objects. `ctx.blockConcurrencyWhile` will now successfully block execution in Durable Objects and invoking Workers will no longer cause unhandled rejections.

- Updated dependencies [[`fc47c79`](https://github.com/cloudflare/workers-sdk/commit/fc47c79f7c5ab532e0437897c8d7ab06abd5298d), [`f5ebb33`](https://github.com/cloudflare/workers-sdk/commit/f5ebb3376d918267df8c6722dcd73da35f5b4f81), [`6291fa1`](https://github.com/cloudflare/workers-sdk/commit/6291fa161571e0f02e22768dd506f7e3398fee94), [`0838f1b`](https://github.com/cloudflare/workers-sdk/commit/0838f1b4ccce347921f3a0746652fe379dd16faf), [`234afae`](https://github.com/cloudflare/workers-sdk/commit/234afae20456d3d3c4eb3d41fb2852ee866fec0a)]:
  - miniflare@4.20250424.0
  - wrangler@4.13.1
  - @cloudflare/unenv-preset@2.3.1

## 1.0.10

### Patch Changes

- Updated dependencies [[`c409318`](https://github.com/cloudflare/workers-sdk/commit/c409318f903c71f03498251c51cb854d95eaa53b), [`5ce70bd`](https://github.com/cloudflare/workers-sdk/commit/5ce70bdba8dc7e265447c997dc7c3af92469072b), [`3f0adf3`](https://github.com/cloudflare/workers-sdk/commit/3f0adf3c25e9cede1bd8c2ae873c059d1ab2ef38), [`0cfcfe0`](https://github.com/cloudflare/workers-sdk/commit/0cfcfe02eccaaa7f39218665588fb8970a969765)]:
  - wrangler@4.13.0
  - miniflare@4.20250422.0
  - @cloudflare/unenv-preset@2.3.1

## 1.0.9

### Patch Changes

- Updated dependencies [[`2a7749b`](https://github.com/cloudflare/workers-sdk/commit/2a7749bffb7fe5550c3192401ed6edd72c0eb510), [`41f095b`](https://github.com/cloudflare/workers-sdk/commit/41f095b0dd35411adbca3398966b5cfe8c39d433)]:
  - miniflare@4.20250417.0
  - wrangler@4.12.1
  - @cloudflare/unenv-preset@2.3.1

## 1.0.8

### Patch Changes

- Updated dependencies [[`eab7ad9`](https://github.com/cloudflare/workers-sdk/commit/eab7ad9af618bc85a79c077f07c6efcf05ae3f5f), [`62c40d7`](https://github.com/cloudflare/workers-sdk/commit/62c40d792b9555e6e25a5f99ae803e4943c4b56f), [`5de2b9a`](https://github.com/cloudflare/workers-sdk/commit/5de2b9a39a6cb6ac730d0f8f1b60f9f756c24993), [`69864b4`](https://github.com/cloudflare/workers-sdk/commit/69864b416420e2e8877befe8c41a507b78cd4413)]:
  - wrangler@4.12.0
  - miniflare@4.20250416.0
  - @cloudflare/unenv-preset@2.3.1

## 1.0.7

### Patch Changes

- [#8786](https://github.com/cloudflare/workers-sdk/pull/8786) [`191ebc1`](https://github.com/cloudflare/workers-sdk/commit/191ebc1ebf6f20957d4b08c1428d0468743c82ea) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure users can change inspector port when running vite dev

  Ensure that the inspector port is updated if the user modifies it in the Vite config while the dev server is running.

- Updated dependencies [[`bab1724`](https://github.com/cloudflare/workers-sdk/commit/bab1724229974c545084c31df3731e7c2271ee49), [`511be3d`](https://github.com/cloudflare/workers-sdk/commit/511be3d17559e482fedf559cb61158e329c11d24), [`085a565`](https://github.com/cloudflare/workers-sdk/commit/085a565bb922ad023a38e2aee2042885e6691b2c)]:
  - wrangler@4.11.1
  - miniflare@4.20250410.1
  - @cloudflare/unenv-preset@2.3.1

## 1.0.6

### Patch Changes

- [#8878](https://github.com/cloudflare/workers-sdk/pull/8878) [`d04c69f`](https://github.com/cloudflare/workers-sdk/commit/d04c69f81eb40a854c219fdcad53e0387ca5f2e2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - add support for Node.js ALS compat mode

- Updated dependencies [[`c912b99`](https://github.com/cloudflare/workers-sdk/commit/c912b9943e4df158994e4be698e4be602397f03c), [`f5413c5`](https://github.com/cloudflare/workers-sdk/commit/f5413c5269ab32522a70c3ebedba95bf6e7a4684), [`f2802f9`](https://github.com/cloudflare/workers-sdk/commit/f2802f9cdb3c3c97a2aa22f66d427af29a824f68), [`d2b44a2`](https://github.com/cloudflare/workers-sdk/commit/d2b44a2f49deb749ad3a7918210ff680263a559c), [`4cc036d`](https://github.com/cloudflare/workers-sdk/commit/4cc036d46b2f5c3ceacb344882e713e7840becde), [`84ecfe9`](https://github.com/cloudflare/workers-sdk/commit/84ecfe9b4962d1edbe7967cfe4151f26de252a9d)]:
  - wrangler@4.11.0
  - miniflare@4.20250410.0
  - @cloudflare/unenv-preset@2.3.1

## 1.0.5

### Patch Changes

- [#8685](https://github.com/cloudflare/workers-sdk/pull/8685) [`8e87754`](https://github.com/cloudflare/workers-sdk/commit/8e87754a2aee9dd2fb764a8ea03365553874f727) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - make sure that `.dev.vars` files trigger a full reload

- Updated dependencies [[`b7ac367`](https://github.com/cloudflare/workers-sdk/commit/b7ac367fe4c3d7a05525443cc30af10bc19ce014), [`dcce2ec`](https://github.com/cloudflare/workers-sdk/commit/dcce2ecf275c65428956d2106b83618652a907a0), [`5388447`](https://github.com/cloudflare/workers-sdk/commit/5388447d7ca5b00dbcc0970f52b76e20a17ebe30)]:
  - miniflare@4.20250409.0
  - wrangler@4.10.0
  - @cloudflare/unenv-preset@2.3.1

## 1.0.4

### Patch Changes

- [#8862](https://github.com/cloudflare/workers-sdk/pull/8862) [`f843447`](https://github.com/cloudflare/workers-sdk/commit/f843447377af1c89f3c58d9e5aa14a18b12a8894) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix a bug where Node.js externals (i.e. Node.js imports that are included in the runtime) were being registered as missing imports with the `depsOptimizer`. This was previously causing the dev server to crash if these imports were encountered when using React Router.

## 1.0.3

### Patch Changes

- Updated dependencies [[`d454ad9`](https://github.com/cloudflare/workers-sdk/commit/d454ad99a75985744e7c48c93be098a96120e763)]:
  - miniflare@4.20250408.0
  - wrangler@4.9.1
  - @cloudflare/unenv-preset@2.3.1

## 1.0.2

### Patch Changes

- [#8823](https://github.com/cloudflare/workers-sdk/pull/8823) [`f566680`](https://github.com/cloudflare/workers-sdk/commit/f5666806ebe806216bba20efd634ab1075e382b8) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: replace `process.env.NODE_ENV` for nodejs_compat builds

  make sure that occurrences of `process.env.NODE_ENV` are replaced with the
  current `process.env.NODE_ENV` value or `"production"` on builds that include
  the `nodejs_compat` flag, this enables libraries checking such value
  (e.g. `react-dom`) to be properly treeshaken

- Updated dependencies [[`afd93b9`](https://github.com/cloudflare/workers-sdk/commit/afd93b98d8eb700ce51dc8ea30eb0c0d56deae8d), [`930ebb2`](https://github.com/cloudflare/workers-sdk/commit/930ebb279e165c1a82a70e89431e0a5a09b06647), [`09464a6`](https://github.com/cloudflare/workers-sdk/commit/09464a6c0d5bbc7b5ac2e33d68621e84f4fb4557), [`62df08a`](https://github.com/cloudflare/workers-sdk/commit/62df08af388c0e12bca807a96b9ce8dac02edd8f)]:
  - miniflare@4.20250405.1
  - wrangler@4.9.0
  - @cloudflare/unenv-preset@2.3.1

## 1.0.1

### Patch Changes

- [#8806](https://github.com/cloudflare/workers-sdk/pull/8806) [`2f47670`](https://github.com/cloudflare/workers-sdk/commit/2f4767056495e587de7d9d4370667ea82bc2e6fe) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Replace assertion in vite-plugin-cloudflare:nodejs-compat plugin transform hook with early return. This prevents an error from being logged when building with React Router and TailwindCSS.

- Updated dependencies [[`4e69fb6`](https://github.com/cloudflare/workers-sdk/commit/4e69fb6f05138b32500695846482dd22bb2590d9), [`93267cf`](https://github.com/cloudflare/workers-sdk/commit/93267cf3c59d57792fb10cc10b23255e33679c4d), [`ec7e621`](https://github.com/cloudflare/workers-sdk/commit/ec7e6212199272f9811a30a84922823c82d7d650), [`75b454c`](https://github.com/cloudflare/workers-sdk/commit/75b454c37e3fd25162275e984834929cdb886c0f), [`d4c1171`](https://github.com/cloudflare/workers-sdk/commit/d4c11710fd36286be8587379d659e19e91778777)]:
  - wrangler@4.8.0
  - miniflare@4.20250405.0
  - @cloudflare/unenv-preset@2.3.1

## 1.0.0

### Major Changes

- [#8787](https://github.com/cloudflare/workers-sdk/pull/8787) [`3af2e30`](https://github.com/cloudflare/workers-sdk/commit/3af2e30f8fe30924e4f8d4909e49d97ec76d46eb) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Release version 1.0.

  See https://developers.cloudflare.com/workers/vite-plugin/ for more information.

### Patch Changes

- Updated dependencies [[`e0efb6f`](https://github.com/cloudflare/workers-sdk/commit/e0efb6f17e0c76aa504711b6ca25c025ee1d21e5), [`2650fd3`](https://github.com/cloudflare/workers-sdk/commit/2650fd38cf05e385594ada152dc7a7ad5252af84), [`196f51d`](https://github.com/cloudflare/workers-sdk/commit/196f51db7d7e1719464f19be5902c7b749205abb), [`0a401d0`](https://github.com/cloudflare/workers-sdk/commit/0a401d07714dc4e383060a0bbf71843c13d13281)]:
  - miniflare@4.20250404.0
  - wrangler@4.7.2
  - @cloudflare/unenv-preset@2.3.1

## 0.1.21

### Patch Changes

- [#8768](https://github.com/cloudflare/workers-sdk/pull/8768) [`beb8a6f`](https://github.com/cloudflare/workers-sdk/commit/beb8a6fac33a3ea776aacde2c3b316dd3268d008) Thanks [@jamesopstad](https://github.com/jamesopstad)! - No longer warn if the user sets `upload_source_maps` in the Worker config.

- [#8767](https://github.com/cloudflare/workers-sdk/pull/8767) [`61b916e`](https://github.com/cloudflare/workers-sdk/commit/61b916e0fe1f5a6812a3173ca2744ec9c5a4edd8) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix inspector port change being logged on server restarts. An available inspector port is now found on the initial server start and reused across restarts.

- Updated dependencies [[`7427004`](https://github.com/cloudflare/workers-sdk/commit/7427004d45e52c0ef6e6e8dbe3ed5b79dc985d55), [`007f322`](https://github.com/cloudflare/workers-sdk/commit/007f322f66dc1edc70840330166732d25dae9cb3), [`199caa4`](https://github.com/cloudflare/workers-sdk/commit/199caa40eb37fd4bc4b3adb499e37d87d30f76dd), [`80ef13c`](https://github.com/cloudflare/workers-sdk/commit/80ef13c23da11345133f8909bd4c713ca6e31ec8), [`55b336f`](https://github.com/cloudflare/workers-sdk/commit/55b336f4385b16a3f87782f2eecdf7d5c64a0621), [`245cfbd`](https://github.com/cloudflare/workers-sdk/commit/245cfbd70d82b687073169b1ea732f7ce0b08f31)]:
  - wrangler@4.7.1
  - miniflare@4.20250321.2
  - @cloudflare/unenv-preset@2.3.1

## 0.1.20

### Patch Changes

- [#8688](https://github.com/cloudflare/workers-sdk/pull/8688) [`28522ae`](https://github.com/cloudflare/workers-sdk/commit/28522aea505a23ca8b392fdc11ff5a2d8d6486f5) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Ensure that Node.js polyfills are pre-optimized before the first request

  Previously, these polyfills were only optimized on demand when Vite became aware of them.
  This was either because Vite was able to find an import to a polyfill when statically analysing the import tree of the entry-point,
  or when a polyfilled module was dynamically imported as part of a executing code to handle a request.

  In the second case, the optimizing of the dynamically imported dependency causes a reload of the Vite server, which can break applications that are holding state in modules during the request.
  This is the case of most React type frameworks, in particular React Router.

  Now, we pre-optimize all the possible Node.js polyfills when the server starts before the first request is handled.

- [#8680](https://github.com/cloudflare/workers-sdk/pull/8680) [`8dcc50f`](https://github.com/cloudflare/workers-sdk/commit/8dcc50f50d0bffc3c555beacbc19da7e6e130542) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that users can specify inspector port `0` to use a random port

- [#8572](https://github.com/cloudflare/workers-sdk/pull/8572) [`e6fea13`](https://github.com/cloudflare/workers-sdk/commit/e6fea13186f2da77228b9bf0eb0b12e79d1f2eb9) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add validation for the `configPath` option in the plugin config that clearly indicates any issues.

- [#8672](https://github.com/cloudflare/workers-sdk/pull/8672) [`d533f5e`](https://github.com/cloudflare/workers-sdk/commit/d533f5ee7da69c205d8d5e2a5f264d2370fc612b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - replace modules runtime checks with vite environment config validation

  currently at runtime the vite plugin applies checks to make sure that
  external files are not being imported, such checks are however too
  restrictive and prevent worker code to perform some valid imports from
  node_modules (e.g. `import stylesheet from "<some-package>/styles.css?url";`)

  the changes here replace the runtime checks (allowing valid imports from
  node_modules) with some validation to the worker vite environment configurations,
  specifically they make sure that the environment doesn't specify invalid
  `optimizeDeps.exclude` and `resolve.external` options

- [#8680](https://github.com/cloudflare/workers-sdk/pull/8680) [`8dcc50f`](https://github.com/cloudflare/workers-sdk/commit/8dcc50f50d0bffc3c555beacbc19da7e6e130542) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that the plugin keeps looking for available inspector ports by default

  this change updates the plugin so that if an inspector port is not specified and the
  default inspector port (9229) is not available it keeps looking for other available
  port instead of crashing

- Updated dependencies [[`3993374`](https://github.com/cloudflare/workers-sdk/commit/39933740e81156baf90475acc23093eb3da8f47f), [`8df60b5`](https://github.com/cloudflare/workers-sdk/commit/8df60b592c0b0eaf7329b2e8d0f16fac9ac6c329), [`ec1f813`](https://github.com/cloudflare/workers-sdk/commit/ec1f813e9aff7f4af9ca187754ecf5006361bd38), [`624882e`](https://github.com/cloudflare/workers-sdk/commit/624882eaeb8db25096e4a84f8e194497de46be82)]:
  - wrangler@4.7.0
  - @cloudflare/unenv-preset@2.3.1

## 0.1.19

### Patch Changes

- [#8706](https://github.com/cloudflare/workers-sdk/pull/8706) [`25eaf3b`](https://github.com/cloudflare/workers-sdk/commit/25eaf3b54a93c7e9fe941ae5f84322fcf7b1f4cd) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Set the `x-forwarded-host` header to the original host in requests. This fixes a bug where libraries such as Clerk would redirect to the workerd host rather than the Vite host.

- Updated dependencies [[`ecbab5d`](https://github.com/cloudflare/workers-sdk/commit/ecbab5d256bf01d700797bba2ebb04b24b21b629), [`24c2c8f`](https://github.com/cloudflare/workers-sdk/commit/24c2c8f6053861e665cb0b4eb4af88d148e8480d)]:
  - wrangler@4.6.0
  - @cloudflare/unenv-preset@2.3.1

## 0.1.18

### Patch Changes

- [#8702](https://github.com/cloudflare/workers-sdk/pull/8702) [`fcd71f8`](https://github.com/cloudflare/workers-sdk/commit/fcd71f8589d20c07d60ad519d53f3dc3f6f031ff) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ensure that we don't crash when logging Node.js warnings when running in react-router builds

- [#8207](https://github.com/cloudflare/workers-sdk/pull/8207) [`910007b`](https://github.com/cloudflare/workers-sdk/commit/910007bce580997051ac6ae438197f51eaa93b66) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Show warning if the user has forgotten to turn on nodejs_compat

- Updated dependencies [[`cad99dc`](https://github.com/cloudflare/workers-sdk/commit/cad99dc78d76e35f846e85ac328effff8ba9477d), [`f29f018`](https://github.com/cloudflare/workers-sdk/commit/f29f01813683ab3e42c53738be3d49a0f8cba512)]:
  - miniflare@4.20250321.1
  - wrangler@4.5.1
  - @cloudflare/unenv-preset@2.3.1

## 0.1.17

### Patch Changes

- [#8652](https://github.com/cloudflare/workers-sdk/pull/8652) [`a18155f`](https://github.com/cloudflare/workers-sdk/commit/a18155fb81f0399528a40f843736ff6565dc5579) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix a bug where updating config files would crash the dev server. This occurred because the previous Miniflare instance was not disposed before creating a new one. This would lead to a port collision because of the `inspectorPort` introduced by the new debugging features.

- Updated dependencies [[`8e3688f`](https://github.com/cloudflare/workers-sdk/commit/8e3688f27209edeac6241bf240ee5eec62d7ddb2), [`f043b74`](https://github.com/cloudflare/workers-sdk/commit/f043b74c715ebd7ca1e3f62139ad43e57cec8f05), [`14602d9`](https://github.com/cloudflare/workers-sdk/commit/14602d9f39f3fb1df7303dab5c91a77fa21e46f9)]:
  - wrangler@4.5.0
  - @cloudflare/unenv-preset@2.3.1

## 0.1.16

### Patch Changes

- [#8432](https://github.com/cloudflare/workers-sdk/pull/8432) [`d611caf`](https://github.com/cloudflare/workers-sdk/commit/d611caf7193644893aaa408c9de39f75cd427daf) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Experimental: add support for Workers Assets metafiles (\_headers and \_redirects) in `vite dev`.

  **Experimental feature**: This feature is being made available behind an experimental option (`headersAndRedirectsDevModeSupport`) in the cloudflare plugin configuration. It could change or be removed at any time.

  ```ts
  cloudflare({
  	// ...
  	experimental: { headersAndRedirectsDevModeSupport: true },
  }),
  ```

  Currently, in this experimental mode, requests that would result in an HTML response or a 404 response will take into account the \_headers and \_redirects settings.

  Known limitation: requests for existing static assets will be served directly by Vite without considering the \_headers or \_redirects settings.

  Production deployments or using `vite preview` already accurately supports the `_headers` and `_footers` features. The recommendation is to use `vite preview` for local testing of these settings.

- Updated dependencies [[`7682675`](https://github.com/cloudflare/workers-sdk/commit/768267567427cb54f39dc13860b09affd924267d), [`9c844f7`](https://github.com/cloudflare/workers-sdk/commit/9c844f771a5345e3ccf64f07ac1d476a50a80fb6), [`d8c0495`](https://github.com/cloudflare/workers-sdk/commit/d8c04956a8c9e426bd7d26a421dff6d3f0590fd2), [`29cb306`](https://github.com/cloudflare/workers-sdk/commit/29cb3069c9bae79941247dc2fd71021f1c75887d), [`e4b76e8`](https://github.com/cloudflare/workers-sdk/commit/e4b76e8d2a038d58a142bc79c05c9aa7db9eb3eb)]:
  - miniflare@4.20250321.0
  - wrangler@4.4.1
  - @cloudflare/unenv-preset@2.3.1

## 0.1.15

### Patch Changes

- [#8556](https://github.com/cloudflare/workers-sdk/pull/8556) [`b7d6b7d`](https://github.com/cloudflare/workers-sdk/commit/b7d6b7dd1fbbaecd4f595d2d4249ab902b726538) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add support for `assets_navigation_prefer_asset_serving` in Vite (`dev` and `preview`)

- [#8608](https://github.com/cloudflare/workers-sdk/pull/8608) [`dee6068`](https://github.com/cloudflare/workers-sdk/commit/dee6068af62f0d84c6f882a9102197ff9ce5f515) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - export `PluginConfig` type

- [#8507](https://github.com/cloudflare/workers-sdk/pull/8507) [`57ddaac`](https://github.com/cloudflare/workers-sdk/commit/57ddaacde4e9c91859179df68b1e7dbb36fe2d2b) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that internal variables are not exposed in the importable `env` object

- Updated dependencies [[`d8f1c49`](https://github.com/cloudflare/workers-sdk/commit/d8f1c49541229f4b41bd16bbebda3017a5d17d64), [`b7d6b7d`](https://github.com/cloudflare/workers-sdk/commit/b7d6b7dd1fbbaecd4f595d2d4249ab902b726538), [`4a5f270`](https://github.com/cloudflare/workers-sdk/commit/4a5f270129f4a2d8995ba2fdd7fc220ee7c75300), [`5f151fc`](https://github.com/cloudflare/workers-sdk/commit/5f151fc93bfcc87f9a6aa2a33cd67901e3507365), [`5d78760`](https://github.com/cloudflare/workers-sdk/commit/5d78760af7adbb57416d73f102123152d37bec53), [`0d1240b`](https://github.com/cloudflare/workers-sdk/commit/0d1240becf3c08094b39e215de6d730f0d25de6b), [`c0d0cd0`](https://github.com/cloudflare/workers-sdk/commit/c0d0cd03a5eede7ec4f8a615f2c4b1f9a73dfcee), [`1c94eee`](https://github.com/cloudflare/workers-sdk/commit/1c94eee008a8281e84171ef1edee74d965b90c33)]:
  - miniflare@4.20250320.0
  - wrangler@4.4.0
  - @cloudflare/unenv-preset@2.3.0

## 0.1.14

### Patch Changes

- [#8365](https://github.com/cloudflare/workers-sdk/pull/8365) [`f3db430`](https://github.com/cloudflare/workers-sdk/commit/f3db4306f86c817f8cbec8d7dbb21fc08107aa55) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - update vite-plugin to use the latest unenv-preset

- [#8489](https://github.com/cloudflare/workers-sdk/pull/8489) [`37adc1d`](https://github.com/cloudflare/workers-sdk/commit/37adc1dbd233e083469422c4958f6ec5b932bff1) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure `process.env` is populated when the `nodejs_compat_populate_process_env` flag is set

- [#8587](https://github.com/cloudflare/workers-sdk/pull/8587) [`18fa891`](https://github.com/cloudflare/workers-sdk/commit/18fa89131d97683d43765b1ffbd31c9ff7c40f93) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for `.wasm?init` extension to load WebAssembly as documented by Vite (https://vite.dev/guide/features.html#webassembly).

- [#8441](https://github.com/cloudflare/workers-sdk/pull/8441) [`257e7f9`](https://github.com/cloudflare/workers-sdk/commit/257e7f9485d22de2bab97f2dba22f495d6c7b11f) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `inspectorPort` option to plugin config

  add an `inspectorPort` option that allows developers to start a devTools inspector server to debug their workers (defaulting to `9229`)

- [#8545](https://github.com/cloudflare/workers-sdk/pull/8545) [`aadb49c`](https://github.com/cloudflare/workers-sdk/commit/aadb49c5cda8f99863af0ada5889ef32aaa10ef9) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Make `assets` field optional in the Worker config when using assets. At build time, assets are included if there is a client build.

- [#8441](https://github.com/cloudflare/workers-sdk/pull/8441) [`257e7f9`](https://github.com/cloudflare/workers-sdk/commit/257e7f9485d22de2bab97f2dba22f495d6c7b11f) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `/__debug` path for better debugging

  add a new `/__debug` path that users can navigate to in order to debug their workers

- [#8387](https://github.com/cloudflare/workers-sdk/pull/8387) [`dbbeb23`](https://github.com/cloudflare/workers-sdk/commit/dbbeb23c71215894c6ee14eb1a6fd01030f9212c) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support Text and Data module types.
  Text modules can be imported with a `.txt` or `.html` extension while Data modules can be imported with a `.bin` extension.
  This expands on the existing support for WebAssembly modules, which can now be imported with `.wasm` or `.wasm?module` extensions.
  Custom rules are not supported.
  More info on including non-JavaScript modules can be found [here](https://developers.cloudflare.com/workers/wrangler/bundling/#including-non-javascript-modules).
- Updated dependencies [[`9adbd50`](https://github.com/cloudflare/workers-sdk/commit/9adbd50cf1cbe841f8885de1d1d22b084fcfd987), [`dae7bd4`](https://github.com/cloudflare/workers-sdk/commit/dae7bd4dd0b97956d868799e6a01fe8b47a7250a), [`383dc0a`](https://github.com/cloudflare/workers-sdk/commit/383dc0abd5c883b3c39ece1abb1f332d1f63a0bb), [`c4fa349`](https://github.com/cloudflare/workers-sdk/commit/c4fa349da3667be6c2ba0d96031b69e4674edbd8), [`8278db5`](https://github.com/cloudflare/workers-sdk/commit/8278db5c862f51032ef7a2f79770f329c7f9dd9b), [`86ab0ca`](https://github.com/cloudflare/workers-sdk/commit/86ab0ca52ab878a5c01900218e91261ac09f5438), [`a25f060`](https://github.com/cloudflare/workers-sdk/commit/a25f060232bfbfb30aede6a891b665f0450770bf), [`a7bd79b`](https://github.com/cloudflare/workers-sdk/commit/a7bd79bf40afe7079cd94557482bd909d825af09), [`62d5471`](https://github.com/cloudflare/workers-sdk/commit/62d5471eae9b5ed8cb31f025fa23ba3930b94317), [`2a43cdc`](https://github.com/cloudflare/workers-sdk/commit/2a43cdcf7218bd840737790707e07cbb25baa8ea), [`5ae12a9`](https://github.com/cloudflare/workers-sdk/commit/5ae12a9390f81a3e1df2eb3da4a34dc143879a3c), [`29015e5`](https://github.com/cloudflare/workers-sdk/commit/29015e5577ad8b063b93425da5e80d5054add728)]:
  - miniflare@4.20250319.0
  - wrangler@4.3.0
  - @cloudflare/unenv-preset@2.3.0

## 0.1.13

### Patch Changes

- [#8505](https://github.com/cloudflare/workers-sdk/pull/8505) [`03435cc`](https://github.com/cloudflare/workers-sdk/commit/03435cc17efdf1e2942fb244c47fbcb7710205da) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support Wrangler v4 as peer dependency.

- [#8523](https://github.com/cloudflare/workers-sdk/pull/8523) [`c7f86cb`](https://github.com/cloudflare/workers-sdk/commit/c7f86cbdfcd6d630425d96b2eeddcf4ed4093767) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add validation for the Wrangler config `main` field

- [#8515](https://github.com/cloudflare/workers-sdk/pull/8515) [`3d69e52`](https://github.com/cloudflare/workers-sdk/commit/3d69e5205c5a71ace30c83eb94d006e19d342ed2) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Set `target` in `optimizeDeps.esbuildOptions` to `es2022`. This fixes a bug where the target for prebundled dependencies did not match the build target.

- Updated dependencies [[`14680b9`](https://github.com/cloudflare/workers-sdk/commit/14680b90a23463d4592511ba4e02d38c30c1d2ea), [`fd9dff8`](https://github.com/cloudflare/workers-sdk/commit/fd9dff833870b768af34b391bb109782d86908bb), [`ff26dc2`](https://github.com/cloudflare/workers-sdk/commit/ff26dc20210c193b9e175f5567277d5584bdf657), [`05973bb`](https://github.com/cloudflare/workers-sdk/commit/05973bba4ca49e0fad43e6094ddea67cdf67dc42), [`4ad78ea`](https://github.com/cloudflare/workers-sdk/commit/4ad78ea2c9b8fed7e3afe581e1c320b852969f6a)]:
  - wrangler@4.2.0
  - miniflare@4.20250317.1
  - @cloudflare/unenv-preset@2.2.0

## 0.1.12

### Patch Changes

- Updated dependencies [[`b8fd1b1`](https://github.com/cloudflare/workers-sdk/commit/b8fd1b1c8be1d84a0b3be5f27f7c91f88d9473d2), [`4978e5b`](https://github.com/cloudflare/workers-sdk/commit/4978e5bebb081a5ff6901d0b1bb807d51c3db30b), [`5ae180e`](https://github.com/cloudflare/workers-sdk/commit/5ae180ee8acfc03b46bc3e836f5ce3856c458af8), [`74b0c73`](https://github.com/cloudflare/workers-sdk/commit/74b0c7377a643241d4e3efa674cd644f8f5b8e10), [`931b53d`](https://github.com/cloudflare/workers-sdk/commit/931b53d708b0369de97475a9f427bcb922795378), [`edf169d`](https://github.com/cloudflare/workers-sdk/commit/edf169d15062a31dec1d32427fb72438425b45bf), [`1b2aa91`](https://github.com/cloudflare/workers-sdk/commit/1b2aa916fecb010dd250de3b2bbdd527bed992ef)]:
  - wrangler@4.1.0
  - miniflare@4.20250317.0
  - @cloudflare/unenv-preset@2.0.2

## 0.1.11

### Patch Changes

- Updated dependencies [[`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f), [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f)]:
  - wrangler@4.0.0
  - miniflare@4.20250310.0
  - @cloudflare/unenv-preset@2.0.2

## 0.1.10

### Patch Changes

- [#8273](https://github.com/cloudflare/workers-sdk/pull/8273) [`e3efd68`](https://github.com/cloudflare/workers-sdk/commit/e3efd68e3989815f6935fa4315e0aa23aaac11c9) Thanks [@penalosa](https://github.com/penalosa)! - Support AI, Vectorize, and Images bindings when using `@cloudflare/vite-plugin`

- Updated dependencies [[`8d6d722`](https://github.com/cloudflare/workers-sdk/commit/8d6d7224bcebe04691478e2c5261c00992a1747a), [`8242e07`](https://github.com/cloudflare/workers-sdk/commit/8242e07447f47ab764655e8ec9a046b1fe9ea279), [`e3efd68`](https://github.com/cloudflare/workers-sdk/commit/e3efd68e3989815f6935fa4315e0aa23aaac11c9), [`a352798`](https://github.com/cloudflare/workers-sdk/commit/a3527988e8849eab92b66cfb3a30334bef706b34), [`53e6323`](https://github.com/cloudflare/workers-sdk/commit/53e63233c5b9bb786af3daea63c10ffe60a5d881), [`4d9d9e6`](https://github.com/cloudflare/workers-sdk/commit/4d9d9e6c830b32a0e9948ace32e20a1cdac3a53b)]:
  - wrangler@3.114.1
  - miniflare@3.20250310.0
  - @cloudflare/unenv-preset@2.0.2

## 0.1.9

### Patch Changes

- [#8356](https://github.com/cloudflare/workers-sdk/pull/8356) [`d1d5b53`](https://github.com/cloudflare/workers-sdk/commit/d1d5b5313a60713c84f212edd7f1c7fe32e3e593) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Support dynamic import paths in preview mode.

- Updated dependencies [[`2d40989`](https://github.com/cloudflare/workers-sdk/commit/2d409892f1cf08f07f84d25dcab023bc20ada374), [`da568e5`](https://github.com/cloudflare/workers-sdk/commit/da568e5a94bf270cfdcd80123d8161fc5437dcd2), [`cf14e17`](https://github.com/cloudflare/workers-sdk/commit/cf14e17d40b9e51475ba4d9ee6b4e3ef5ae5e841), [`79c7810`](https://github.com/cloudflare/workers-sdk/commit/79c781076cc79e512753b65644c027138aa1d878)]:
  - miniflare@3.20250224.0
  - @cloudflare/unenv-preset@2.0.0

## 0.1.8

### Patch Changes

- [#8320](https://github.com/cloudflare/workers-sdk/pull/8320) [`c8fab4d`](https://github.com/cloudflare/workers-sdk/commit/c8fab4d93ed044e7d217a876b1c5b0dcb329428c) Thanks [@threepointone](https://github.com/threepointone)! - chore: tweak a couple of error messages in the vite plugin

  I was seeing an error like this: `Unexpected error: no match for module path.`. But it wasn't telling me what the path was. On debugging I noticed that it was telling me about the module "path"! Which meant I needed to enable node_compat. This patch just makes the messaging a little clearer.

  (Ideally we'd spot that it was a node builtin and recommend turning on node_compat, but I'll leave that to you folks.)

- Updated dependencies [[`fce642d`](https://github.com/cloudflare/workers-sdk/commit/fce642d59264b1b6e7df8a6c9a015519b7574637), [`ff96a70`](https://github.com/cloudflare/workers-sdk/commit/ff96a7091439a4645772778295fd373f1a51718b), [`a4909cb`](https://github.com/cloudflare/workers-sdk/commit/a4909cbe552eae72b901cd78bf1f814f818085a0)]:
  - miniflare@3.20250214.2
  - @cloudflare/unenv-preset@2.0.0

## 0.1.7

### Patch Changes

- [#8206](https://github.com/cloudflare/workers-sdk/pull/8206) [`477f8d9`](https://github.com/cloudflare/workers-sdk/commit/477f8d935baac1eca1545fed8585e5a09a28258f) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for binding to named entrypoints in the same worker

- [#8266](https://github.com/cloudflare/workers-sdk/pull/8266) [`9f05e8f`](https://github.com/cloudflare/workers-sdk/commit/9f05e8fcfbf1308689a7c88c78f39a500b895857) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Make it possible to override `builder.buildApp` in the user config or prior plugins

- Updated dependencies []:
  - @cloudflare/unenv-preset@1.1.2

## 0.1.6

### Patch Changes

- Updated dependencies [[`a9a4c33`](https://github.com/cloudflare/workers-sdk/commit/a9a4c33143b9f58673ac0cdd251957997275fa10), [`6cae13a`](https://github.com/cloudflare/workers-sdk/commit/6cae13aa5f338cee18ec2e43a5dadda0c7d8dc2e)]:
  - miniflare@3.20250214.1
  - @cloudflare/unenv-preset@1.1.2

## 0.1.5

### Patch Changes

- [#8231](https://github.com/cloudflare/workers-sdk/pull/8231) [`51a2fd3`](https://github.com/cloudflare/workers-sdk/commit/51a2fd398b26bb922b798b3aa6a51e5457ab0273) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: use ESM WebSocketServer import to avoid crashing vite dev

  It appears that if there are multiple versions of the `ws` package in a user's project
  then the Node.js resolution picks up the ESM "import" package export rather than the "require" package export.
  This results in the entry-point having different JS exports:
  In particular the default export no longer contains a `Server` property; instead one must import the `WebSocketServer` named JS export.
  While it is not clear why the Node.js behaviour changes in this way, the cleanest fix is to import the `WebSocketServer` directly.

## 0.1.4

### Patch Changes

- [#8209](https://github.com/cloudflare/workers-sdk/pull/8209) [`1427535`](https://github.com/cloudflare/workers-sdk/commit/14275353664ab484014d421b4686e87c4eba72a0) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Fix bug with usage of Cloudflare builtins in dependencies. These are now externalized during dependency optimization.

- Updated dependencies []:
  - @cloudflare/unenv-preset@1.1.2

## 0.1.3

### Patch Changes

- [#8176](https://github.com/cloudflare/workers-sdk/pull/8176) [`693d63e`](https://github.com/cloudflare/workers-sdk/commit/693d63eda629400fffcb4de35da282c66bc2e645) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: refactor Node.js compat support to ensure all polyfills are pre-bundled before the first request

## 0.1.2

### Patch Changes

- Updated dependencies [[`5e06177`](https://github.com/cloudflare/workers-sdk/commit/5e06177861b29aa9b114f9ecb50093190af94f4b)]:
  - miniflare@3.20250214.0
  - @cloudflare/unenv-preset@1.1.2

## 0.1.1

### Patch Changes

- [#8118](https://github.com/cloudflare/workers-sdk/pull/8118) [`ca3cbc4`](https://github.com/cloudflare/workers-sdk/commit/ca3cbc42ad60c04148ea6c4cd3d2cc06c94b3814) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix Node.js compat module resolution

  In v0.0.8 we landed support for Vite 6.1 and also switched to using the new Cloudflare owned unenv preset.
  Unfortunately, the changes made in that update caused a regression in Node.js support.
  This became apparent only when the plugin was being used with certain package managers and outside of the workers-sdk monorepo.

  The unenv polyfills that get compiled into the Worker are transitive dependencies of this plugin, not direct dependencies of the user's application were the plugin is being used.
  This is on purpose to avoid the user having to install these dependencies themselves.

  Unfortunately, the changes in 0.0.8 did not correctly resolve the polyfills from `@cloudflare/unenv-preset` and `unenv` when the dependencies were not also installed directly into the user's application.

  The approach was incorrectly relying upon setting the `importer` in calls to Vite's `resolve(id, importer)` method to base the resolution in the context of the vite plugin package rather than the user's application.
  This doesn't work because the `importer` is only relevant when the `id` is relative, and not a bare module specifier in the case of the unenv polyfills.

  This change fixes how these id are resolved in the plugin by manually resolving the path at the appropriate point, while still leveraging Vite's resolution pipeline to handle aliasing, and dependency optimization.

  This change now introduces e2e tests that checks that isolated installations of the plugin works with npm, pnpm and yarn.

- Updated dependencies [[`28b1dc7`](https://github.com/cloudflare/workers-sdk/commit/28b1dc7c6f213de336d58ce93308575de8f42f06)]:
  - wrangler@3.109.1
  - @cloudflare/unenv-preset@1.1.2

## 0.1.0

### Minor Changes

- [#8080](https://github.com/cloudflare/workers-sdk/pull/8080) [`d0fda3d`](https://github.com/cloudflare/workers-sdk/commit/d0fda3df3fcc3e9607e1cbf5ddab83f40e517f09) Thanks [@jamesopstad](https://github.com/jamesopstad)! - No longer call `next` in server middleware.

  This is so that the Cloudflare plugin can override subsequent dev middleware for framework integrations.

### Patch Changes

- [#8079](https://github.com/cloudflare/workers-sdk/pull/8079) [`1b07419`](https://github.com/cloudflare/workers-sdk/commit/1b07419b5ac90657af1cc5fbcdfcc680021cfd73) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Call `writeDeployConfig` in `writeBundle` rather than `builder.buildApp`.

  The deploy config file is now written in the `writeBundle` hook rather than `builder.buildApp`. This ensures that the file is still written if other plugins override `builder` in the Vite config.

- Updated dependencies [[`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a), [`fff677e`](https://github.com/cloudflare/workers-sdk/commit/fff677e35f67c28275262c1d19f7eb4d6c6ab071), [`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a), [`542c6ea`](https://github.com/cloudflare/workers-sdk/commit/542c6ead5d7c7e64a103abd5572ec7b8aea96c90), [`3fb801f`](https://github.com/cloudflare/workers-sdk/commit/3fb801f734632c165685799cb1b752c4dad0445a), [`4db1fb5`](https://github.com/cloudflare/workers-sdk/commit/4db1fb5696412c6666589a778184e10386294d71), [`542c6ea`](https://github.com/cloudflare/workers-sdk/commit/542c6ead5d7c7e64a103abd5572ec7b8aea96c90), [`1bc60d7`](https://github.com/cloudflare/workers-sdk/commit/1bc60d761ebf67a64ac248e3e2c826407bc26252), [`1aa2a91`](https://github.com/cloudflare/workers-sdk/commit/1aa2a9198578f8eb106f19c8475a63ff4eef26aa), [`35710e5`](https://github.com/cloudflare/workers-sdk/commit/35710e590f20e5c83fb25138ba4ae7890b780a08)]:
  - wrangler@3.109.0
  - miniflare@3.20250204.1
  - @cloudflare/unenv-preset@1.1.2

## 0.0.8

### Patch Changes

- [#7830](https://github.com/cloudflare/workers-sdk/pull/7830) [`99ba292`](https://github.com/cloudflare/workers-sdk/commit/99ba292d8b21bb0aa005aa88c5dc968d0f089740) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - add support for Vite 6.1

- [#7830](https://github.com/cloudflare/workers-sdk/pull/7830) [`99ba292`](https://github.com/cloudflare/workers-sdk/commit/99ba292d8b21bb0aa005aa88c5dc968d0f089740) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - implement the new Cloudflare unenv preset into the Vite plugin

## 0.0.7

### Patch Changes

- [#8091](https://github.com/cloudflare/workers-sdk/pull/8091) [`9a3d525`](https://github.com/cloudflare/workers-sdk/commit/9a3d525717d26d0c40331327d0e8556a179944ff) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Omit files from public directory in Worker builds

- [#8083](https://github.com/cloudflare/workers-sdk/pull/8083) [`027698c`](https://github.com/cloudflare/workers-sdk/commit/027698c059a3df14c96bf63a20961b94187b543c) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Ensure the correct data types are sent in WebSocket messages from the client to the Worker

- [#8031](https://github.com/cloudflare/workers-sdk/pull/8031) [`07db54c`](https://github.com/cloudflare/workers-sdk/commit/07db54c21bfe0ac40364bd5c04e0d3597343b7a1) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for Wasm (WebAssembly) modules.

- Updated dependencies [[`b1966df`](https://github.com/cloudflare/workers-sdk/commit/b1966dfe57713f3ddcaa781d0551a1088a22424e), [`c80dbd8`](https://github.com/cloudflare/workers-sdk/commit/c80dbd8d5e53a081cf600e250f1ddda860be1a12), [`1f80d69`](https://github.com/cloudflare/workers-sdk/commit/1f80d69f566d240428ddec0c7b62a23c6f5af3c1), [`88514c8`](https://github.com/cloudflare/workers-sdk/commit/88514c82d447903e48d9f782446a6b502e553631), [`9d08af8`](https://github.com/cloudflare/workers-sdk/commit/9d08af81893df499d914b890d784a9554ebf9507), [`6abe69c`](https://github.com/cloudflare/workers-sdk/commit/6abe69c3fe1fb2e762153a3094119ed83038a50b), [`0c0374c`](https://github.com/cloudflare/workers-sdk/commit/0c0374cce3908a47f7459ba4810855c1ce124349), [`b2dca9a`](https://github.com/cloudflare/workers-sdk/commit/b2dca9a2fb885cb4da87a959fefa035c0974d15c), [`6abe69c`](https://github.com/cloudflare/workers-sdk/commit/6abe69c3fe1fb2e762153a3094119ed83038a50b), [`c412a31`](https://github.com/cloudflare/workers-sdk/commit/c412a31985f3c622e5e3cf366699f9e6977184a2), [`60310cd`](https://github.com/cloudflare/workers-sdk/commit/60310cd796468e96571a4d0520f92af54da62630), [`71fd250`](https://github.com/cloudflare/workers-sdk/commit/71fd250f67a02feab7a2f66623ac8bd52b7f7f21)]:
  - wrangler@3.108.0
  - miniflare@3.20250204.0

## 0.0.6

### Patch Changes

- Updated dependencies [[`ab49886`](https://github.com/cloudflare/workers-sdk/commit/ab498862b96551774f601403d3e93d2105a18a91), [`e2b3306`](https://github.com/cloudflare/workers-sdk/commit/e2b3306e1721dbc0ba8e0eb2025a519b80adbd01)]:
  - miniflare@3.20250129.0
  - wrangler@3.107.1

## 0.0.5

### Patch Changes

- [#7864](https://github.com/cloudflare/workers-sdk/pull/7864) [`de6fa18`](https://github.com/cloudflare/workers-sdk/commit/de6fa1846ac793a86356a319a09482f08819b632) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Add full support for `.dev.vars` files.

  This change makes sure that `.dev.vars` files work when the environment is specified. It also
  copies the target `.dev.vars` file (which might be environment specific, e.g. `.dev.vars.prod`)
  to the worker's dist directory so that `vite preview` can pick it up.
  The copied file will always be named `.dev.vars`.

- Updated dependencies [[`d758215`](https://github.com/cloudflare/workers-sdk/commit/d7582150a5dc6568ac1d1ebcdf24667c83c6a5eb), [`34f9797`](https://github.com/cloudflare/workers-sdk/commit/34f9797822836b98edc4d8ddc6e2fb0ab322b864), [`f57bc4e`](https://github.com/cloudflare/workers-sdk/commit/f57bc4e059b19334783f8f8f7d46c5a710a589ae), [`cf4f47a`](https://github.com/cloudflare/workers-sdk/commit/cf4f47a8af2dc476f8a0e61f0d22f080f191de1f), [`38db4ed`](https://github.com/cloudflare/workers-sdk/commit/38db4ed4de3bed0b4c33d23ee035882a71fbb26b), [`de6fa18`](https://github.com/cloudflare/workers-sdk/commit/de6fa1846ac793a86356a319a09482f08819b632), [`bc4d6c8`](https://github.com/cloudflare/workers-sdk/commit/bc4d6c8d25f40308231e9109dc643df68bc72b52)]:
  - wrangler@3.107.0
  - miniflare@3.20250124.1

## 0.0.4

### Patch Changes

- [#7909](https://github.com/cloudflare/workers-sdk/pull/7909) [`0b79cec`](https://github.com/cloudflare/workers-sdk/commit/0b79cec51760a5b928b51d4140e6797eaac4644b) Thanks [@byule](https://github.com/byule)! - Support unsafe params

- Updated dependencies [[`50b13f6`](https://github.com/cloudflare/workers-sdk/commit/50b13f60af0eac176a000caf7cc799b21fe3f3c5), [`134d61d`](https://github.com/cloudflare/workers-sdk/commit/134d61d97bb96337220e530f4af2ec2c8236f383), [`5c02e46`](https://github.com/cloudflare/workers-sdk/commit/5c02e46c89cce24d81d696173b0e52ce04a8ba59), [`2b6f149`](https://github.com/cloudflare/workers-sdk/commit/2b6f1496685b23b6734c3001db49d3086005582e), [`bd9228e`](https://github.com/cloudflare/workers-sdk/commit/bd9228e855c25b2f5d94e298d6d1128484019f83), [`13ab591`](https://github.com/cloudflare/workers-sdk/commit/13ab5916058e8e834f3e13fb9b5b9d9addc0f930)]:
  - wrangler@3.106.0
  - miniflare@3.20250124.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`fd5a455`](https://github.com/cloudflare/workers-sdk/commit/fd5a45520e92e0fe60c457a6ae54caef67d7bbcf), [`40f89a9`](https://github.com/cloudflare/workers-sdk/commit/40f89a90d93f57294e49a6b5ed8ba8cc38e0da77), [`7d138d9`](https://github.com/cloudflare/workers-sdk/commit/7d138d92c3cbfb84bccb84a3e93f41ad5549d604)]:
  - wrangler@3.105.1
  - miniflare@3.20250124.0

## 0.0.2

### Patch Changes

- [#7846](https://github.com/cloudflare/workers-sdk/pull/7846) [`cd31971`](https://github.com/cloudflare/workers-sdk/commit/cd319710a741185d0a5f03f2a26a352b7254cc00) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that runner initialization is properly validated

- Updated dependencies [[`e5ebdb1`](https://github.com/cloudflare/workers-sdk/commit/e5ebdb143788728d8b364fcafc0b36bda4ceb625), [`bdc7958`](https://github.com/cloudflare/workers-sdk/commit/bdc7958f22bbbb9ce2608fefd295054121a92441), [`78a9a2d`](https://github.com/cloudflare/workers-sdk/commit/78a9a2db485fefb0038ea9d97cc547a9218b7afa)]:
  - wrangler@3.105.0
  - miniflare@3.20241230.2

## 0.0.1

### Patch Changes

- [#7763](https://github.com/cloudflare/workers-sdk/pull/7763) [`7e04493`](https://github.com/cloudflare/workers-sdk/commit/7e0449340caba36b8db0e8121623bf286acacd3b) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Initial beta release of the Cloudflare Vite plugin

- Updated dependencies [[`cccfe51`](https://github.com/cloudflare/workers-sdk/commit/cccfe51ca6a18a2a69bb6c7fa7066c92c9d704af), [`fcaa02c`](https://github.com/cloudflare/workers-sdk/commit/fcaa02cdf4f3f648d7218e8f7fb411a2324eebb5), [`26fa9e8`](https://github.com/cloudflare/workers-sdk/commit/26fa9e80279401ba5eea4e1522597953441402f2), [`97d2a1b`](https://github.com/cloudflare/workers-sdk/commit/97d2a1bb56ea0bb94531f9c41b737ba43ed5996f), [`d7adb50`](https://github.com/cloudflare/workers-sdk/commit/d7adb50fcc9e3c509365fed8a86df485ea9f739b), [`f6cc029`](https://github.com/cloudflare/workers-sdk/commit/f6cc0293d3a6bf45a323b6d9718b7162149cc84f), [`9077a67`](https://github.com/cloudflare/workers-sdk/commit/9077a6748a30d5f24c9b7cbdc3a6514fec5aa66c)]:
  - wrangler@3.104.0
  - miniflare@3.20241230.2
