# @cloudflare/deploy-helpers

## 0.8.0

### Minor Changes

- [#15172](https://github.com/cloudflare/workers-sdk/pull/15172) [`c68f9cb`](https://github.com/cloudflare/workers-sdk/commit/c68f9cb866a2eae4416d20f584f733527189f18a) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Add container support to worker previews

  Worker previews now support containers through a new `previews.containers` configuration block. Container configuration doesn't inherit, so declare containers explicitly in the `previews` block to enable them for previews. This mirrors how `previews.durable_objects` works today. Wrangler names each preview container application `{worker_name}_{preview_slug}_{class_name}`, normalising and shortening the result to what the API accepts. Either change appends a short digest of the composed name, so two names that would otherwise land on one stay distinct. An entry cannot set its own `name`, because application names are unique to an account and a fixed name would collide between two previews of the same Worker. A Durable Object class is backed by at most one container application, so the validator rejects two entries that share a `class_name`. Wrangler skips container applications bound to Durable Object classes that another Worker implements through `script_name`, because the implementing Worker owns its own container application. A binding is not required: a Durable Object declared through `migrations` or `exports` and reached only over `ctx.exports` can still back a container. Every entry must set `class_name`. A `previews.containers` entry whose `class_name` matches no Durable Object class at all is rejected before the preview deployment is created, so a typo fails loudly instead of producing a preview with no container.

  Wrangler creates the container applications on `wrangler preview`. Deleting a preview tears them down server side, so `wrangler preview delete` doesn't remove them.

  Container build and deploy progress prints to stdout. `wrangler preview --json` suppresses wrangler's own output so it doesn't interleave with the payload, and warnings and errors still go to stderr. Docker's build output and the progress spinner write to stdout directly and bypass that suppression, so parse `--json` from a non interactive shell, where the spinner is skipped, and prefer a prebuilt `image` over a Dockerfile.

- [#15174](https://github.com/cloudflare/workers-sdk/pull/15174) [`649f667`](https://github.com/cloudflare/workers-sdk/commit/649f667bd871061da945881ce953ef8f81caea1a) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - [private beta]: Create the parent Worker automatically when `wrangler preview` targets one that doesn't exist yet

  Previews hang off a parent Worker, so running `wrangler preview` before the Worker had ever been deployed failed with a raw API error naming the Preview endpoint. Wrangler now offers to create an empty parent Worker and then carries on creating the Preview. The parent uses the same workers.dev and Preview URL settings that `wrangler deploy` would resolve, without applying routes or cron triggers. In non-interactive environments, Wrangler creates the Worker without asking.

### Patch Changes

- [#15253](https://github.com/cloudflare/workers-sdk/pull/15253) [`630048b`](https://github.com/cloudflare/workers-sdk/commit/630048b3d8a9e8f76b57be23f81743a3fb7de177) Thanks [@emily-shen](https://github.com/emily-shen)! - Refactor triggers deploy validation and dry-run

  Move more logic into the deploy-helpers package for easy reuse by `cf`.

- [#15284](https://github.com/cloudflare/workers-sdk/pull/15284) [`39dcea6`](https://github.com/cloudflare/workers-sdk/commit/39dcea6c9362e2d651e3108fa769dbbc32db5a7b) Thanks [@emily-shen](https://github.com/emily-shen)! - Move deploy output writing into shared deploy helpers

- Updated dependencies [[`59872c4`](https://github.com/cloudflare/workers-sdk/commit/59872c41d4417d9b8c2efddb4b35662453efcaae), [`c68f9cb`](https://github.com/cloudflare/workers-sdk/commit/c68f9cb866a2eae4416d20f584f733527189f18a), [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864), [`5ae9d5b`](https://github.com/cloudflare/workers-sdk/commit/5ae9d5b205fea31516559f7ad89a21eda671af2f), [`4b52975`](https://github.com/cloudflare/workers-sdk/commit/4b52975aac295c8483d6b4001d0b50945293265a), [`ce9b151`](https://github.com/cloudflare/workers-sdk/commit/ce9b1510abf5c1152aedc94456f4d7ffe9402248), [`5c10e39`](https://github.com/cloudflare/workers-sdk/commit/5c10e398979c0a054f58dcf2751012cc99e977d2), [`39dcea6`](https://github.com/cloudflare/workers-sdk/commit/39dcea6c9362e2d651e3108fa769dbbc32db5a7b), [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864), [`99a1f49`](https://github.com/cloudflare/workers-sdk/commit/99a1f49d7c037a25d4a19a3fe3054337e7201864), [`30c2d47`](https://github.com/cloudflare/workers-sdk/commit/30c2d47965c51350aca6b2c70db8fc6496bdaa17)]:
  - miniflare@5.20260820.0-alpha
  - @cloudflare/workers-utils@0.34.0
  - @cloudflare/cli-shared-helpers@0.1.25

## 0.7.1

### Patch Changes

- Updated dependencies [[`1277a72`](https://github.com/cloudflare/workers-sdk/commit/1277a72e0d01325c37a05c0e8f5111a45100af77), [`fb6b51b`](https://github.com/cloudflare/workers-sdk/commit/fb6b51b87bf73edca9866bdf2d0810d7bf491108), [`4f922dc`](https://github.com/cloudflare/workers-sdk/commit/4f922dc19941db31394357f7e146af320ae1f3d9), [`4d74b8d`](https://github.com/cloudflare/workers-sdk/commit/4d74b8d8fd5c034c012fa13973ee20bedbc844c7), [`2e0c962`](https://github.com/cloudflare/workers-sdk/commit/2e0c962da0c57bdc79b5edcaa64c7b725c1524f0), [`1b73c87`](https://github.com/cloudflare/workers-sdk/commit/1b73c879c168dcc78b0f2657d04bc784b8af7da3), [`8777180`](https://github.com/cloudflare/workers-sdk/commit/8777180b8239d9df435acee465d02682477e93ea)]:
  - miniflare@5.20260815.0-alpha
  - @cloudflare/workers-utils@0.33.1
  - @cloudflare/cli-shared-helpers@0.1.24

## 0.7.0

### Minor Changes

- [#15152](https://github.com/cloudflare/workers-sdk/pull/15152) [`f0f2054`](https://github.com/cloudflare/workers-sdk/commit/f0f2054a48f5b7536268e8be432148943ba73557) Thanks [@GregBrimble](https://github.com/GregBrimble)! - [private beta]: Updates the `--ignore-defaults` flag to `--ignore-base-config` on `wrangler preview` commands.

  `--ignore-base-config` now only takes effect on Preview creation, rather than on each deployment, since Preview base configuration is now copy-on-create rather than inherit-on-deploy.

### Patch Changes

- Updated dependencies [[`b8fd112`](https://github.com/cloudflare/workers-sdk/commit/b8fd112136abf4ff17c3d456eaa7b22880bcaf6a)]:
  - miniflare@5.20260811.1-alpha

## 0.6.9

### Patch Changes

- Updated dependencies [[`d0c976c`](https://github.com/cloudflare/workers-sdk/commit/d0c976c04ad890fcef56305ded11f1405e89273e), [`d0c976c`](https://github.com/cloudflare/workers-sdk/commit/d0c976c04ad890fcef56305ded11f1405e89273e), [`0b82b15`](https://github.com/cloudflare/workers-sdk/commit/0b82b1574b3327681a0091716ed274c8f0544a48), [`d0c976c`](https://github.com/cloudflare/workers-sdk/commit/d0c976c04ad890fcef56305ded11f1405e89273e), [`90dd5e5`](https://github.com/cloudflare/workers-sdk/commit/90dd5e597e3eeeb2ec17636386b75fea770cedc9), [`d0c976c`](https://github.com/cloudflare/workers-sdk/commit/d0c976c04ad890fcef56305ded11f1405e89273e)]:
  - miniflare@5.20260811.0-alpha
  - @cloudflare/workers-utils@0.33.0
  - @cloudflare/cli-shared-helpers@0.1.23

## 0.6.8

### Patch Changes

- [#15081](https://github.com/cloudflare/workers-sdk/pull/15081) [`026e058`](https://github.com/cloudflare/workers-sdk/commit/026e058ff694a77d3d214611bef7c3e41d1fe082) Thanks [@podonnell-dev](https://github.com/podonnell-dev)! - Compact `wrangler preview` deployment success output

  `wrangler preview` now prints a concise success summary with the Preview name, Preview URL, deployment ID, and Deployment URL instead of the previous box-art settings summary.

- [#15132](https://github.com/cloudflare/workers-sdk/pull/15132) [`5b1b930`](https://github.com/cloudflare/workers-sdk/commit/5b1b93025f7d71c1b4b99abd90d2dc579c149ae5) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Fetch script metadata directly instead of listing all scripts

  When resolving Durable Object migrations, fetch the specific script's service metadata via `/workers/services/{name}` instead of listing all scripts in the account via `/workers/scripts`. This avoids downloading metadata for every Worker in the account just to find one script's migration tag.

- Updated dependencies [[`c7aede7`](https://github.com/cloudflare/workers-sdk/commit/c7aede764b601d1b73aa208f6a6ff63f646f4136), [`0aa8fa5`](https://github.com/cloudflare/workers-sdk/commit/0aa8fa5e12bc64facb4e9fece321a762269d0357)]:
  - miniflare@5.20260804.1-alpha
  - @cloudflare/workers-utils@0.32.0
  - @cloudflare/cli-shared-helpers@0.1.22

## 0.6.7

### Patch Changes

- Updated dependencies [[`6dbd192`](https://github.com/cloudflare/workers-sdk/commit/6dbd192f1f3e4899789cd327231ba838c90bb0d5), [`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3), [`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3), [`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3), [`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3), [`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3), [`2194f88`](https://github.com/cloudflare/workers-sdk/commit/2194f888e53a987ee12c75f1f58f5af287e3c8a3)]:
  - miniflare@5.20260804.0-alpha

## 0.6.6

### Patch Changes

- [#15013](https://github.com/cloudflare/workers-sdk/pull/15013) [`8cf78c8`](https://github.com/cloudflare/workers-sdk/commit/8cf78c83cb4c64be8b458d7bd618b47e7c6e7d25) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Update undici from 7.28.0 to 7.29.0

- Updated dependencies [[`b4f0c97`](https://github.com/cloudflare/workers-sdk/commit/b4f0c9760bcab1e04cf1a9c8859feed8b4fc6487), [`8cf78c8`](https://github.com/cloudflare/workers-sdk/commit/8cf78c83cb4c64be8b458d7bd618b47e7c6e7d25), [`a60ff4d`](https://github.com/cloudflare/workers-sdk/commit/a60ff4dea0bbae8775726d9cf885655b56460a30), [`6946da1`](https://github.com/cloudflare/workers-sdk/commit/6946da1123f3c8484af80ec4f5426c5fe0bbdb34), [`99eb50c`](https://github.com/cloudflare/workers-sdk/commit/99eb50ce1d3420a50ae0e95958bf49d65874706e)]:
  - miniflare@5.20260801.1-alpha
  - @cloudflare/workers-utils@0.31.2
  - @cloudflare/cli-shared-helpers@0.1.21

## 0.6.5

### Patch Changes

- Updated dependencies [[`b5c083b`](https://github.com/cloudflare/workers-sdk/commit/b5c083bf601d71bad82ccc044df55ba4584085e2), [`9c74538`](https://github.com/cloudflare/workers-sdk/commit/9c7453837e3293787c0cb1778520f630aea7e5ca), [`a88d169`](https://github.com/cloudflare/workers-sdk/commit/a88d1691d57bf44616ad15556a51b7f8ca17375c), [`a88d169`](https://github.com/cloudflare/workers-sdk/commit/a88d1691d57bf44616ad15556a51b7f8ca17375c), [`daf65f2`](https://github.com/cloudflare/workers-sdk/commit/daf65f28cecf35e251dc6e476d5bbd82972d68de)]:
  - @cloudflare/workers-utils@0.31.1
  - miniflare@5.20260801.0-alpha
  - @cloudflare/cli-shared-helpers@0.1.20

## 0.6.4

### Patch Changes

- Updated dependencies [[`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6), [`5a56dda`](https://github.com/cloudflare/workers-sdk/commit/5a56ddaf8548fe79787482506b3d5e0233c329c6)]:
  - miniflare@5.20260730.0-alpha
  - @cloudflare/workers-utils@0.31.0
  - @cloudflare/cli-shared-helpers@0.1.19

## 0.6.3

### Patch Changes

- Updated dependencies [[`01d7020`](https://github.com/cloudflare/workers-sdk/commit/01d7020806dd523158cf9f26a4575365117f5381), [`48f0c6c`](https://github.com/cloudflare/workers-sdk/commit/48f0c6cbbc50dfac02e2d76554c181ced233a792), [`d7f38c3`](https://github.com/cloudflare/workers-sdk/commit/d7f38c311e8cd0f29f56a25250da45f62b20f8ca), [`5c25cfe`](https://github.com/cloudflare/workers-sdk/commit/5c25cfe4e03e0d3d42ddab57adc3274d6f6a1a30), [`5e6556a`](https://github.com/cloudflare/workers-sdk/commit/5e6556a0c788679b6ac149ba3018a2cfd7cc73e9), [`1f61001`](https://github.com/cloudflare/workers-sdk/commit/1f61001e5f7a807db7856f5d89e0b26e12a0d0a0)]:
  - miniflare@4.20260730.0
  - @cloudflare/workers-utils@0.30.0
  - @cloudflare/cli-shared-helpers@0.1.18

## 0.6.2

### Patch Changes

- [#14833](https://github.com/cloudflare/workers-sdk/pull/14833) [`773ead4`](https://github.com/cloudflare/workers-sdk/commit/773ead41c7b9338b566a268fd0d88eb8613a3de7) Thanks [@DiogoSantoss](https://github.com/DiogoSantoss)! - Color Email Routing plan change markers

  Wrangler now highlights additions in green, updates in yellow, and deletions and conflicts in red so Email Routing deployment plans are easier to scan before confirmation.

- [#14833](https://github.com/cloudflare/workers-sdk/pull/14833) [`773ead4`](https://github.com/cloudflare/workers-sdk/commit/773ead41c7b9338b566a268fd0d88eb8613a3de7) Thanks [@DiogoSantoss](https://github.com/DiogoSantoss)! - Apply Email Routing changes across independent zones concurrently

  Wrangler now limits concurrent zone updates while preserving the Email Routing plan order within each zone. Deployments that configure addresses across multiple zones complete faster without breaking delete-before-add transitions at a zone's rule limit.

- Updated dependencies [[`1035f74`](https://github.com/cloudflare/workers-sdk/commit/1035f7450006c5c8b8b003135d2b530193c913a1), [`e426cb9`](https://github.com/cloudflare/workers-sdk/commit/e426cb998dce7ecb43ee7ddea1a0b1987add5e1a), [`3a22ae5`](https://github.com/cloudflare/workers-sdk/commit/3a22ae532c5c75c716d4c219e116eb3e0c5b236e), [`465c0fb`](https://github.com/cloudflare/workers-sdk/commit/465c0fb53dbce3613b39f6436d88e15d60caa468), [`552bcfc`](https://github.com/cloudflare/workers-sdk/commit/552bcfc8d44f8625b09dfd5d821c132b626cb7bb), [`6e0bf6e`](https://github.com/cloudflare/workers-sdk/commit/6e0bf6e917bf4a2b9cd3ee741e625174075e38e1)]:
  - miniflare@4.20260722.1
  - @cloudflare/workers-utils@0.29.0
  - @cloudflare/cli-shared-helpers@0.1.17

## 0.6.1

### Patch Changes

- [#14373](https://github.com/cloudflare/workers-sdk/pull/14373) [`246ce92`](https://github.com/cloudflare/workers-sdk/commit/246ce92d1d24974678eb23a03290f9391fe9b272) Thanks [@Jacroney](https://github.com/Jacroney)! - Improve the D1 database-limit error message

  When creating a D1 database fails because the account has hit its database limit, the error now points to the relevant next steps — upgrading on the Workers Free plan or requesting a higher limit on a paid plan — alongside the existing commands to list and delete databases. Previously it only suggested deleting unused databases. This applies both to `wrangler d1 create` and to the D1 database that is created during resource provisioning on deploy.

- Updated dependencies [[`c38a2c3`](https://github.com/cloudflare/workers-sdk/commit/c38a2c358ef5c8628ce26fa8c62f002dda0dcb3d), [`c079ba3`](https://github.com/cloudflare/workers-sdk/commit/c079ba33f1df98e38f7cebc82a64886a7e495879), [`95b026e`](https://github.com/cloudflare/workers-sdk/commit/95b026edfdf0c6b6e40994cd8fa06a350bc868f2), [`c4bacec`](https://github.com/cloudflare/workers-sdk/commit/c4bacec349f2d6e1bf4115f22a4b4eaca62cd0fc), [`3203b5d`](https://github.com/cloudflare/workers-sdk/commit/3203b5d34488b2b14d6066db705acef267d1229a)]:
  - miniflare@4.20260722.0

## 0.6.0

### Minor Changes

- [#14471](https://github.com/cloudflare/workers-sdk/pull/14471) [`f03b108`](https://github.com/cloudflare/workers-sdk/commit/f03b10854d983c353fd4f3d6621b5ed716379ba3) Thanks [@DiogoSantoss](https://github.com/DiogoSantoss)! - Apply Email Routing `addresses` during Worker trigger deployment

  Worker trigger deployment now reconciles the Worker's Email Routing rules with the top-level `addresses` config. This runs for `wrangler deploy`, `wrangler triggers deploy`, and clients of `@cloudflare/deploy-helpers`. After the Worker uploads, or when `wrangler triggers deploy` runs after a version promotion, the deploy helper asks the Email Routing API for a plan, renders the changes grouped by zone (`+` added, `~` updated, `-` deleted, `!` conflict), prompts once for destructive changes in interactive mode, and applies accepted changes through the per-zone rule endpoints. Purely additive plans apply without a prompt, while non-interactive destructive plans fail without modifying rules.

### Patch Changes

- [#14744](https://github.com/cloudflare/workers-sdk/pull/14744) [`a0a091b`](https://github.com/cloudflare/workers-sdk/commit/a0a091b9246c5e10408f57342b3275659c9655e3) Thanks [@penalosa](https://github.com/penalosa)! - Drop the "Experimental:" prefix from the resource provisioning header now that automatic provisioning is generally available. The deploy output now reads `The following bindings need to be provisioned:`.

- Updated dependencies [[`42af66d`](https://github.com/cloudflare/workers-sdk/commit/42af66d00b255945989726387acf46409b4c5eb3), [`4815711`](https://github.com/cloudflare/workers-sdk/commit/4815711fb5f896a5aa9221b6bddb9ef78c3f288d), [`2b390d7`](https://github.com/cloudflare/workers-sdk/commit/2b390d7831ff27aa13cdf05aa8e11e4c0086f924), [`a6c214f`](https://github.com/cloudflare/workers-sdk/commit/a6c214fb311215b1ed09b273171b7995033fb7d7), [`34430b3`](https://github.com/cloudflare/workers-sdk/commit/34430b34f468825775377689621e451d730ab0c9)]:
  - miniflare@4.20260721.0
  - @cloudflare/workers-utils@0.28.0
  - @cloudflare/cli-shared-helpers@0.1.16

## 0.5.1

### Patch Changes

- [#14707](https://github.com/cloudflare/workers-sdk/pull/14707) [`b38f494`](https://github.com/cloudflare/workers-sdk/commit/b38f494204e5e08e561b8f198ef928188e554868) Thanks [@emily-shen](https://github.com/emily-shen)! - Update zod to v4

- Updated dependencies [[`34e696d`](https://github.com/cloudflare/workers-sdk/commit/34e696dc60dcd7ea04cdab8a6267d255efab9983), [`d39ae01`](https://github.com/cloudflare/workers-sdk/commit/d39ae0131018088f8b4c31ba3f5506e224796cce), [`8cd805d`](https://github.com/cloudflare/workers-sdk/commit/8cd805db2f9901cba52d574b385577bafd595cb5), [`9f04a7e`](https://github.com/cloudflare/workers-sdk/commit/9f04a7e96bffe42a5a53d7396624da5374bff981), [`9f04a7e`](https://github.com/cloudflare/workers-sdk/commit/9f04a7e96bffe42a5a53d7396624da5374bff981), [`cb30df3`](https://github.com/cloudflare/workers-sdk/commit/cb30df3a9f19e15535349643c1089e90ba16a80d), [`cb6c3f9`](https://github.com/cloudflare/workers-sdk/commit/cb6c3f9a5c6d67804cd0cb447cc0837a9f75848c), [`3f3afbb`](https://github.com/cloudflare/workers-sdk/commit/3f3afbbf136c404d26ee39d187a44adb06c1b6e8), [`e6fbc4e`](https://github.com/cloudflare/workers-sdk/commit/e6fbc4e67f76f9b78da3d9a2dd27c6e9786d2645)]:
  - miniflare@4.20260714.0
  - @cloudflare/cli-shared-helpers@0.1.15
  - @cloudflare/workers-utils@0.27.0

## 0.5.0

### Minor Changes

- [#14689](https://github.com/cloudflare/workers-sdk/pull/14689) [`2cd84d4`](https://github.com/cloudflare/workers-sdk/commit/2cd84d455cfa174ff7264e94e678b6d2eb2a25e4) Thanks [@emily-shen](https://github.com/emily-shen)! - Publish `@cloudflare/config` package

  `@cloudflare/config` is now published as a standalone package. Previously, its exports (`InputWorkerSchema`, `OutputWorkerSchema`, `convertToWranglerConfig`, and related types) were re-exported through `@cloudflare/deploy-helpers`. Consumers should import directly from `@cloudflare/config` instead.

  `@cloudflare/deploy-helpers` no longer re-exports `@cloudflare/config` symbols.

### Patch Changes

- [#14681](https://github.com/cloudflare/workers-sdk/pull/14681) [`8e29318`](https://github.com/cloudflare/workers-sdk/commit/8e29318b568299e0da3e44d17af62ea2d6b80911) Thanks [@emily-shen](https://github.com/emily-shen)! - Move preview command logic from wrangler into `@cloudflare/deploy-helpers`

  Preview orchestration, API calls, formatting, and settings management now live in `@cloudflare/deploy-helpers`.

- Updated dependencies [[`7692a61`](https://github.com/cloudflare/workers-sdk/commit/7692a6119f49d11289af4ec8cdf9afe95604ef36), [`ed33326`](https://github.com/cloudflare/workers-sdk/commit/ed3332620a15dff35b0875eb9ded87086104b2f0), [`018574b`](https://github.com/cloudflare/workers-sdk/commit/018574b5ab22cc0e3141d1f09c2c383d76d59b2c), [`42df9bb`](https://github.com/cloudflare/workers-sdk/commit/42df9bbf07e37032a3e61027e33d504d74a25ccd), [`7692a61`](https://github.com/cloudflare/workers-sdk/commit/7692a6119f49d11289af4ec8cdf9afe95604ef36)]:
  - miniflare@4.20260710.0
  - @cloudflare/workers-utils@0.27.0
  - @cloudflare/cli-shared-helpers@0.1.14

## 0.4.0

### Minor Changes

- [#14591](https://github.com/cloudflare/workers-sdk/pull/14591) [`0283a1f`](https://github.com/cloudflare/workers-sdk/commit/0283a1fcdc635244f731010422e513e8b4ab0be3) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Export `collectPackageDependencies` for npm dependency metadata collection

  The package dependency discovery logic (collecting installed npm package names and versions from a project's `package.json`) is now owned by `deploy-helpers` and called internally during deploy and version uploads, rather than being pre-computed in wrangler and passed through as a prop.

### Patch Changes

- Updated dependencies [[`0283a1f`](https://github.com/cloudflare/workers-sdk/commit/0283a1fcdc635244f731010422e513e8b4ab0be3), [`1b965c5`](https://github.com/cloudflare/workers-sdk/commit/1b965c51babff16ae7657335d93badebd50c310f)]:
  - @cloudflare/workers-utils@0.26.0
  - miniflare@4.20260708.1
  - @cloudflare/cli-shared-helpers@0.1.13

## 0.3.3

### Patch Changes

- Updated dependencies [[`e3f0cd6`](https://github.com/cloudflare/workers-sdk/commit/e3f0cd69e08c0eed9d75f61221d1076b6c287eef), [`8511ddf`](https://github.com/cloudflare/workers-sdk/commit/8511ddf769a603f49576b8cf632ea330c353001f), [`2fedb1f`](https://github.com/cloudflare/workers-sdk/commit/2fedb1fc811efb3f7544c569e57383cabd4f14f8)]:
  - miniflare@4.20260708.0
  - @cloudflare/workers-utils@0.25.1

## 0.3.2

### Patch Changes

- Updated dependencies [[`0852346`](https://github.com/cloudflare/workers-sdk/commit/08523467752daa79f0f8950a01f35797aa6f3052)]:
  - miniflare@4.20260706.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`e7e5780`](https://github.com/cloudflare/workers-sdk/commit/e7e5780ea2db48fe43233ecedf01979db6c5ce9d), [`aad35b7`](https://github.com/cloudflare/workers-sdk/commit/aad35b79d07df1bb764a4a5912d6b4328a34474b), [`d88555e`](https://github.com/cloudflare/workers-sdk/commit/d88555edb671668ed7f73e587af9effe6e782f53), [`1ac96a1`](https://github.com/cloudflare/workers-sdk/commit/1ac96a14b7fb022acada114ab8793fe8a4ba79a5), [`f416dd9`](https://github.com/cloudflare/workers-sdk/commit/f416dd983e9c6e4d292317e077dfbe839d2f30c8), [`1ca8d8f`](https://github.com/cloudflare/workers-sdk/commit/1ca8d8f0bbd012a1d65cabadf7b6987b252775e9), [`16fbf81`](https://github.com/cloudflare/workers-sdk/commit/16fbf81d923760d295c7f05b0bd660b7be510e5d)]:
  - miniflare@4.20260702.0
  - @cloudflare/workers-utils@0.25.1
  - @cloudflare/cli-shared-helpers@0.1.12

## 0.3.0

### Minor Changes

- [#14474](https://github.com/cloudflare/workers-sdk/pull/14474) [`aa5d580`](https://github.com/cloudflare/workers-sdk/commit/aa5d5801450b7e4417bfdbd477f86de3a4bc6933) Thanks [@WillTaylorDev](https://github.com/WillTaylorDev)! - Add cache options for WorkerEntrypoint exports

  You can now set cache options on `WorkerEntrypoint` exports and configure cross-version cache behavior globally:

  ```jsonc
  // wrangler.json
  {
    "cache": { "enabled": true, "cross_version_cache": true },
    "exports": {
      "default": {
        "type": "worker",
        "cache": { "enabled": false }
      },
      "Admin": {
        "type": "worker",
        "cache": { "enabled": true }
      }
    }
  }
  ```

  Wrangler sends the `exports` config to the deploy and version upload APIs alongside the global `cache.enabled` and `cache.cross_version_cache` settings. The platform resolves those global settings plus cache overrides on exports and validates which entrypoint names are cacheable.

### Patch Changes

- [#14305](https://github.com/cloudflare/workers-sdk/pull/14305) [`98793d8`](https://github.com/cloudflare/workers-sdk/commit/98793d8e00567462518d983d974e0e89b6a474c3) Thanks [@jbwcloudflare](https://github.com/jbwcloudflare)! - Improve asset upload performance with single-file uploads

  Asset uploads now use a more efficient per-file upload path when the platform enables it. This is rolled out server-side and requires no configuration changes. Existing upload behavior is unchanged when the new path is not enabled.

- Updated dependencies [[`aa5d580`](https://github.com/cloudflare/workers-sdk/commit/aa5d5801450b7e4417bfdbd477f86de3a4bc6933), [`6b0ce98`](https://github.com/cloudflare/workers-sdk/commit/6b0ce986b01ec4559e2ac16feb410a186c42f9e1)]:
  - @cloudflare/workers-utils@0.25.0
  - miniflare@4.20260701.0
  - @cloudflare/cli-shared-helpers@0.1.11

## 0.2.5

### Patch Changes

- [#14490](https://github.com/cloudflare/workers-sdk/pull/14490) [`75d8cb0`](https://github.com/cloudflare/workers-sdk/commit/75d8cb0e32e0f4d66b699e88016d01f1666d8d8a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - remove skipLastDeployedFromApiCheck

  This was a temporary option to bypass an API issue, which has been fixed API side.

- Updated dependencies [[`75d8cb0`](https://github.com/cloudflare/workers-sdk/commit/75d8cb0e32e0f4d66b699e88016d01f1666d8d8a), [`f10d4ad`](https://github.com/cloudflare/workers-sdk/commit/f10d4ad99a3e67e04c16425fe25b6c61ec0c54db), [`75d8cb0`](https://github.com/cloudflare/workers-sdk/commit/75d8cb0e32e0f4d66b699e88016d01f1666d8d8a), [`75d8cb0`](https://github.com/cloudflare/workers-sdk/commit/75d8cb0e32e0f4d66b699e88016d01f1666d8d8a)]:
  - miniflare@4.20260630.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`3b743c1`](https://github.com/cloudflare/workers-sdk/commit/3b743c1b86ad80c40fd9d2d678cd5a8cb66e86fa)]:
  - miniflare@4.20260625.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`a085dec`](https://github.com/cloudflare/workers-sdk/commit/a085deca12d7126c21e500b3dd4298edfd13f8cd), [`9a0de8f`](https://github.com/cloudflare/workers-sdk/commit/9a0de8f71f50bb7d1884288e376259082084a315), [`fab565f`](https://github.com/cloudflare/workers-sdk/commit/fab565fdb1a912c73232d72ccdf1963fd96f9ad5)]:
  - miniflare@4.20260623.0

## 0.2.2

### Patch Changes

- [#14354](https://github.com/cloudflare/workers-sdk/pull/14354) [`7649895`](https://github.com/cloudflare/workers-sdk/commit/764989568ecbfadd111fc399c83d71dd9ce6cf1b) Thanks [@emily-shen](https://github.com/emily-shen)! - Move resource provisioning into deploy helpers

  Worker deploy and versions upload now share the deploy helpers implementation for provisioning bindings, reducing Wrangler-specific callback wiring while preserving existing behavior.

- Updated dependencies [[`b38823f`](https://github.com/cloudflare/workers-sdk/commit/b38823fb35a8bdcd00004e74404ab18d7b070dbf), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359), [`cfd6205`](https://github.com/cloudflare/workers-sdk/commit/cfd6205fe86f6afd74b5881f09524c93c83b8359)]:
  - miniflare@4.20260617.1
  - @cloudflare/workers-utils@0.24.0
  - @cloudflare/cli-shared-helpers@0.1.10

## 0.2.1

### Patch Changes

- [#14347](https://github.com/cloudflare/workers-sdk/pull/14347) [`673b09e`](https://github.com/cloudflare/workers-sdk/commit/673b09e0fa26368125fb527596a8eb5d31c27302) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Update undici from 7.24.8 to 7.28.0

- [#14340](https://github.com/cloudflare/workers-sdk/pull/14340) [`f6e49dd`](https://github.com/cloudflare/workers-sdk/commit/f6e49dd59190328007331477450651e8bca2def8) Thanks [@emily-shen](https://github.com/emily-shen)! - add `skipLastDeployedFromApiCheck` to override deploy source check

- [#14269](https://github.com/cloudflare/workers-sdk/pull/14269) [`5dfb788`](https://github.com/cloudflare/workers-sdk/commit/5dfb788595a2104b4b0922cfce3d69a2f1d881eb) Thanks [@mattjohnsonpint](https://github.com/mattjohnsonpint)! - Support `dev.plugin` on typed services bindings

  Wrangler only honored `dev.plugin` on `unsafe.bindings` entries, so users authoring a service binding via `services[]` could not wire it to a local Miniflare plugin during `wrangler dev` — they had to fall back to `unsafe.bindings` and accept a "directly supported by wrangler" warning. Typed services bindings now accept the same `dev: { plugin, options? }` shape, route the binding through Miniflare's external-plugin pathway in `wrangler dev`, and strip the field at deploy time. Validation rejects malformed `dev` shapes.

- Updated dependencies [[`673b09e`](https://github.com/cloudflare/workers-sdk/commit/673b09e0fa26368125fb527596a8eb5d31c27302), [`e930bd4`](https://github.com/cloudflare/workers-sdk/commit/e930bd4ca9880eb0b68ce6d1933c1d9ce290317d), [`5c3bb11`](https://github.com/cloudflare/workers-sdk/commit/5c3bb118a99da70c5c1efb07df37f685e7044ba6), [`296ad65`](https://github.com/cloudflare/workers-sdk/commit/296ad659305ee150d61451991f04a135fe99d264), [`5dfb788`](https://github.com/cloudflare/workers-sdk/commit/5dfb788595a2104b4b0922cfce3d69a2f1d881eb)]:
  - @cloudflare/workers-utils@0.23.2
  - miniflare@4.20260617.0
  - @cloudflare/cli-shared-helpers@0.1.9

## 0.2.0

### Minor Changes

- [#14321](https://github.com/cloudflare/workers-sdk/pull/14321) [`88662aa`](https://github.com/cloudflare/workers-sdk/commit/88662aa727a6b9d576578dc9cdc3b2911efcd89b) Thanks [@emily-shen](https://github.com/emily-shen)! - re-export OutputWorkerSchema from internal config package

- [#14265](https://github.com/cloudflare/workers-sdk/pull/14265) [`e3fce14`](https://github.com/cloudflare/workers-sdk/commit/e3fce14228f6e064d5d7408508107774fa38c296) Thanks [@emily-shen](https://github.com/emily-shen)! - Expose Cloudflare config conversion utilities from deploy helpers

  `@cloudflare/deploy-helpers` now re-exports `ConfigSchema` and `convertToWranglerConfig` from the internal `@cloudflare/config` package, so consumers can parse and convert Cloudflare config files without depending on the unpublished package directly.

### Patch Changes

- [#14265](https://github.com/cloudflare/workers-sdk/pull/14265) [`e3fce14`](https://github.com/cloudflare/workers-sdk/commit/e3fce14228f6e064d5d7408508107774fa38c296) Thanks [@emily-shen](https://github.com/emily-shen)! - Bundle private internal dependencies in deploy helpers

  `@cloudflare/deploy-helpers` no longer declares private workspace packages as runtime dependencies, so installing the package from npm does not require unpublished internal packages.

- [#14304](https://github.com/cloudflare/workers-sdk/pull/14304) [`ee82c76`](https://github.com/cloudflare/workers-sdk/commit/ee82c76b07844f7ae9068b01d29a2a0adf34eed0) Thanks [@emily-shen](https://github.com/emily-shen)! - Skip resource provisioning for asset-only deployments

  Previously, asset-only deployments would provision resources even when there was no user Worker script. On a subsequent deploy, we would re-attempt provisioning as the previous asset-only upload would/could not be bound to the previously provisioned resource. Provisioning would then error as the resource had already been created, blocking the deploy.

- Updated dependencies [[`0e055d3`](https://github.com/cloudflare/workers-sdk/commit/0e055d39c51dda77717515adb1a33610d385a724), [`27db82c`](https://github.com/cloudflare/workers-sdk/commit/27db82c808743f690f023f84be5cde9e223c22d1), [`2a6a26b`](https://github.com/cloudflare/workers-sdk/commit/2a6a26b02f27ac18b1773a5460e1e7e37721a5cb), [`9a424ed`](https://github.com/cloudflare/workers-sdk/commit/9a424ed747009c716db77463c72f8d974e048914), [`ecfdd5a`](https://github.com/cloudflare/workers-sdk/commit/ecfdd5a6c60b9c6f99c28f9294da656933c2a5fd), [`41f391f`](https://github.com/cloudflare/workers-sdk/commit/41f391fdda4112ee333782aad02d16dacaa95f8f)]:
  - miniflare@4.20260616.0
  - @cloudflare/workers-utils@0.23.1
  - @cloudflare/cli-shared-helpers@0.1.8

## 0.1.3

### Patch Changes

- [#14259](https://github.com/cloudflare/workers-sdk/pull/14259) [`2ae6099`](https://github.com/cloudflare/workers-sdk/commit/2ae6099db77c076fb7e6e782d2f0ebd7ba86dbbb) Thanks [@emily-shen](https://github.com/emily-shen)! - Move worker build step earlier in deploy/upload step, before upload specific config validation

- Updated dependencies [[`f3990b2`](https://github.com/cloudflare/workers-sdk/commit/f3990b2358ef49cd6e1ab16de27e25dcd949896f), [`4597f08`](https://github.com/cloudflare/workers-sdk/commit/4597f085d25c7d066ecf056de313e194f41094d1), [`2047a32`](https://github.com/cloudflare/workers-sdk/commit/2047a32cf78886b71b794a3dfac946a146ab3ffe)]:
  - miniflare@4.20260611.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`c6c61b5`](https://github.com/cloudflare/workers-sdk/commit/c6c61b59431443b2bcda25f3af7624dd2ce19b9b), [`b502d54`](https://github.com/cloudflare/workers-sdk/commit/b502d5445b9e9e030020a3d65c0334507393aa64), [`c4f45e8`](https://github.com/cloudflare/workers-sdk/commit/c4f45e8b8694c60fb1808f7fbb130e4b4893d20c)]:
  - @cloudflare/workers-utils@0.23.0

## 0.1.1

### Patch Changes

- [#14063](https://github.com/cloudflare/workers-sdk/pull/14063) [`65b5f9e`](https://github.com/cloudflare/workers-sdk/commit/65b5f9e1855651c2df2c1bdfc8930141e36413d5) Thanks [@emily-shen](https://github.com/emily-shen)! - Move fetch helpers into `@cloudflare/workers-utils`

  Shared Cloudflare API fetch helper types and plumbing now live in `@cloudflare/workers-utils` so Wrangler and other clients can use the same implementation.

## 0.1.0

### Minor Changes

- [#14014](https://github.com/cloudflare/workers-sdk/pull/14014) [`d042705`](https://github.com/cloudflare/workers-sdk/commit/d042705c7a8715184e6e16d399c17adb958d0e80) Thanks [@emily-shen](https://github.com/emily-shen)! - Add `@cloudflare/deploy-helpers` package.

  This introduces a shared internal package for deploy-related helper types and code.
