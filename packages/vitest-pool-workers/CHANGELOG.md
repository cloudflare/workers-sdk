# @cloudflare/vitest-pool-workers

## 0.2.7

### Patch Changes

- Updated dependencies [[`19cac82`](https://github.com/cloudflare/workers-sdk/commit/19cac82233325d1f28eb02de53ea1a810bec3806)]:
  - wrangler@3.54.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`6365c90`](https://github.com/cloudflare/workers-sdk/commit/6365c9077ed7f438a8f5fc827eae2ca04c2520e0), [`27966a4`](https://github.com/cloudflare/workers-sdk/commit/27966a43c65aa6046856d3b813af2d6797b894bf), [`1dd9f7e`](https://github.com/cloudflare/workers-sdk/commit/1dd9f7eeea4df9141c766e52c31828cf201ab71b), [`f63e7a5`](https://github.com/cloudflare/workers-sdk/commit/f63e7a55613d56381c7396cf55c248dc2a0ad305)]:
  - wrangler@3.53.1

## 0.2.5

### Patch Changes

- [#5733](https://github.com/cloudflare/workers-sdk/pull/5733) [`995199f`](https://github.com/cloudflare/workers-sdk/commit/995199f5901f9290e846d6477df613c26bf8ba01) Thanks [@penalosa](https://github.com/penalosa)! - fix: Build all packages before publishing

- Updated dependencies []:
  - wrangler@3.53.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`4097759`](https://github.com/cloudflare/workers-sdk/commit/4097759b6fbef4cd9aa81d3a6f01fc868ff50dd8), [`327a456`](https://github.com/cloudflare/workers-sdk/commit/327a4568751a4046ff8794c72c658c074964a7c7)]:
  - wrangler@3.53.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`3a0d735`](https://github.com/cloudflare/workers-sdk/commit/3a0d7356bd8bc6fe614a3ef3f9c1278659555568), [`24840f6`](https://github.com/cloudflare/workers-sdk/commit/24840f67b6495a664f5463697aa49fa9478435b9), [`81d9615`](https://github.com/cloudflare/workers-sdk/commit/81d961582da2db2b020305c63a9f1f1573ff873d), [`a7e36d5`](https://github.com/cloudflare/workers-sdk/commit/a7e36d503f442a8225ffdedef30b569a8a396663), [`c6312b5`](https://github.com/cloudflare/workers-sdk/commit/c6312b5017279b31ce99c761e2063973f7d948bf), [`1b7739e`](https://github.com/cloudflare/workers-sdk/commit/1b7739e0af99860aa063f01c0a6e7712ac072fdb)]:
  - miniflare@3.20240419.0
  - wrangler@3.52.0

## 0.2.2

### Patch Changes

- [#5652](https://github.com/cloudflare/workers-sdk/pull/5652) [`ccb9d3d`](https://github.com/cloudflare/workers-sdk/commit/ccb9d3d4efba73a720945df4e1212a010fe40739) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: re-release due to broken build

- Updated dependencies [[`ccb9d3d`](https://github.com/cloudflare/workers-sdk/commit/ccb9d3d4efba73a720945df4e1212a010fe40739)]:
  - wrangler@3.51.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`bd2031b`](https://github.com/cloudflare/workers-sdk/commit/bd2031bd5e1304ea104f84f3aa20d231a81f83b1), [`6fe0af4`](https://github.com/cloudflare/workers-sdk/commit/6fe0af46da3ff2262c99e46d287db64506233b43)]:
  - wrangler@3.51.1

## 0.2.0

### Minor Changes

- [#5612](https://github.com/cloudflare/workers-sdk/pull/5612) [`8f470d9`](https://github.com/cloudflare/workers-sdk/commit/8f470d9854664c88da1682b092214521c4793885) Thanks [@Skye-31](https://github.com/Skye-31)! - Feat: Support specifying an environment for your worker when running tests. This allows your tests to pick up bindings & variables that are scoped to specific environments.

  For example:

  ```ts
  import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

  export default defineWorkersConfig({
  	test: {
  		poolOptions: {
  			workers: {
  				wrangler: {
  					configPath: "./wrangler.toml",
  					environment: "production",
  				},
  			},
  		},
  	},
  });
  ```

### Patch Changes

- [#5589](https://github.com/cloudflare/workers-sdk/pull/5589) [`92bc055`](https://github.com/cloudflare/workers-sdk/commit/92bc0551b46891fc8cf600c4598029a232f2afc4) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: Support importing ES modules from libraries that do not correctly provide `"type"="module"` not use `.mjs` extensions

  The toucan-js library has an entry point of `"module": "dist/index.esm.js"`. This file does not use the standard `.mjs` extension, nor does it specify `"type"="module"`, so the resolution and loading algorithm fails to identify this file as an ES Module, defaulting to CommonJS, breaking Vitest.
  Fixes #5588

- Updated dependencies [[`9a46e03`](https://github.com/cloudflare/workers-sdk/commit/9a46e03f013cc6f1e2d38d47f9bf002626b6bd95), [`c9f081a`](https://github.com/cloudflare/workers-sdk/commit/c9f081ab72142060a3cf2e9a7ef4546b8014b210), [`fbe1c9c`](https://github.com/cloudflare/workers-sdk/commit/fbe1c9c816f2b5774060d721ff830e70d9b7d29f), [`22f5841`](https://github.com/cloudflare/workers-sdk/commit/22f58414d5697730f0337d17c7602b7fa3bebb79), [`c9f081a`](https://github.com/cloudflare/workers-sdk/commit/c9f081ab72142060a3cf2e9a7ef4546b8014b210)]:
  - wrangler@3.51.0
  - miniflare@3.20240405.2

## 0.1.19

### Patch Changes

- Updated dependencies [[`d95450f`](https://github.com/cloudflare/workers-sdk/commit/d95450f0b00fa32d4c827fc8ad25d8fc929a654d), [`65aa21c`](https://github.com/cloudflare/workers-sdk/commit/65aa21cc2d53b99e4c6956a3fb69bd687a102266), [`08b4908`](https://github.com/cloudflare/workers-sdk/commit/08b490806093add445ff3d7b1969923cb4123d34), [`ce00a44`](https://github.com/cloudflare/workers-sdk/commit/ce00a44c985859a5ffb5ee3dc392796e5d12ff1d)]:
  - wrangler@3.50.0
  - miniflare@3.20240405.1

## 0.1.18

### Patch Changes

- Updated dependencies [[`113ac41`](https://github.com/cloudflare/workers-sdk/commit/113ac41cda3bd6304c0683f6f8e61dcedf21e685), [`9575a51`](https://github.com/cloudflare/workers-sdk/commit/9575a514cbc206fea6d08f627253ead209fd2a8d), [`7999dd2`](https://github.com/cloudflare/workers-sdk/commit/7999dd2bacf53be3780ba70492003d417ffcd5f0), [`4f47f74`](https://github.com/cloudflare/workers-sdk/commit/4f47f7422786e537eaefd034153998f848bcd573), [`59591cd`](https://github.com/cloudflare/workers-sdk/commit/59591cd5ace98bbfefd2ec34eb77dfeafd8db97d), [`dcd65dd`](https://github.com/cloudflare/workers-sdk/commit/dcd65dd3da19f619cd9c48d42433ac538a734816), [`57d5658`](https://github.com/cloudflare/workers-sdk/commit/57d5658bc5560f4ba38fd1b21a1988a4922feea2), [`a7aa28a`](https://github.com/cloudflare/workers-sdk/commit/a7aa28ad57c07ea96aad1ddc547afb11db679878)]:
  - wrangler@3.49.0
  - miniflare@3.20240405.0

## 0.1.17

### Patch Changes

- Updated dependencies [[`887150a`](https://github.com/cloudflare/workers-sdk/commit/887150ae64d78800e1f44ea25d69f06e76e9f127), [`bafbd67`](https://github.com/cloudflare/workers-sdk/commit/bafbd6719bbec1e323ee161a0106bf98c60255a2), [`c5561b7`](https://github.com/cloudflare/workers-sdk/commit/c5561b7236adf2b97e09e4ae9139654e23d635fe)]:
  - wrangler@3.48.0

## 0.1.16

### Patch Changes

- Updated dependencies [[`9f15ce1`](https://github.com/cloudflare/workers-sdk/commit/9f15ce1716c50dd44adf7a3df6a4101322800005)]:
  - miniflare@3.20240404.0
  - wrangler@3.47.1

## 0.1.15

### Patch Changes

- Updated dependencies [[`7734f80`](https://github.com/cloudflare/workers-sdk/commit/7734f806c1ac2a38faabc87df4aa8344b585c430)]:
  - wrangler@3.47.0

## 0.1.14

### Patch Changes

- Updated dependencies [[`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327), [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327), [`b7ddde1`](https://github.com/cloudflare/workers-sdk/commit/b7ddde1a5165223dcbe8781e928039123778b8a1), [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327), [`6c3be5b`](https://github.com/cloudflare/workers-sdk/commit/6c3be5b299b22cad050760a6015106839b5cc74e), [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327), [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327)]:
  - wrangler@3.46.0
  - miniflare@3.20240403.0

## 0.1.13

### Patch Changes

- Updated dependencies [[`5d68744`](https://github.com/cloudflare/workers-sdk/commit/5d6874499049641c1d3d3f47161e7ebf3bc57650), [`68faf67`](https://github.com/cloudflare/workers-sdk/commit/68faf67f0499927d7bded1342ccc9c8c9e76037a), [`a232ccf`](https://github.com/cloudflare/workers-sdk/commit/a232ccffe6a2994df5181b6252965a7ba4a0c17a), [`e7f8dc3`](https://github.com/cloudflare/workers-sdk/commit/e7f8dc32465921e0a9a38e8e3deeaf17c04c010a), [`bf9dca8`](https://github.com/cloudflare/workers-sdk/commit/bf9dca85a16c4133d2d200a9e2fc52dcf8917550), [`940ad89`](https://github.com/cloudflare/workers-sdk/commit/940ad89713fa086f23d394570c328716bfb1bd59), [`5d6d521`](https://github.com/cloudflare/workers-sdk/commit/5d6d5218ba0686279e6b67d86592ece16949bf25), [`489b9c5`](https://github.com/cloudflare/workers-sdk/commit/489b9c51550d583d50e262f5905393501c2d6419)]:
  - wrangler@3.45.0
  - miniflare@3.20240329.1

## 0.1.12

### Patch Changes

- Updated dependencies [[`0cce21f`](https://github.com/cloudflare/workers-sdk/commit/0cce21ff5b27cc4c227e102eb470b0e0cae455bb), [`02a1091`](https://github.com/cloudflare/workers-sdk/commit/02a109172e60446a8c8e79a2804fdd387c4525a5), [`f69e562`](https://github.com/cloudflare/workers-sdk/commit/f69e5629f8155186e7e890aa38509bb3fbfa704f)]:
  - wrangler@3.44.0

## 0.1.11

### Patch Changes

- Updated dependencies [[`ef9fbba`](https://github.com/cloudflare/workers-sdk/commit/ef9fbba36444fac665b95bedb2acd1fda494871b), [`91a2150`](https://github.com/cloudflare/workers-sdk/commit/91a2150b9e565d1d6519f635e19f36fc2dec0886)]:
  - wrangler@3.43.0

## 0.1.10

### Patch Changes

- Updated dependencies [[`77152f3`](https://github.com/cloudflare/workers-sdk/commit/77152f355340d3aac492164fe912a7c5d7a3daeb), [`d994066`](https://github.com/cloudflare/workers-sdk/commit/d994066f255f6851759a055eac3b52a4aa4b83c3)]:
  - wrangler@3.42.0
  - miniflare@3.20240329.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`b7a6d9d`](https://github.com/cloudflare/workers-sdk/commit/b7a6d9d422dbe1f09f35b5105a9a58dd425604a7)]:
  - wrangler@3.41.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`daac6a2`](https://github.com/cloudflare/workers-sdk/commit/daac6a2282c362a79990794dc00baca56ccc3e6e), [`9343714`](https://github.com/cloudflare/workers-sdk/commit/9343714155d5fa71c7415457dd35ab343d047d0f), [`dc0c1dc`](https://github.com/cloudflare/workers-sdk/commit/dc0c1dc527c3ed2f79196f3b0ef44b337833a07a), [`7115568`](https://github.com/cloudflare/workers-sdk/commit/71155680d3675acd6f522e8b312aa63846a076a4), [`c90dd6b`](https://github.com/cloudflare/workers-sdk/commit/c90dd6b8a86238003ac953bd97566f92a206817d), [`b341614`](https://github.com/cloudflare/workers-sdk/commit/b3416145f3fc220aa833e24cbaa1c8612062e2de), [`976adec`](https://github.com/cloudflare/workers-sdk/commit/976adec23e3d993b190faf65f4f06b0508c5a22d), [`3e5a932`](https://github.com/cloudflare/workers-sdk/commit/3e5a932eca2e3e26d135e005967ca36801f27d97), [`fbdca7d`](https://github.com/cloudflare/workers-sdk/commit/fbdca7d93156f9db2a1513573e45f10fac7e57d1), [`47b325a`](https://github.com/cloudflare/workers-sdk/commit/47b325af0df87bcf20d922ff385ae9cd21726863)]:
  - wrangler@3.40.0
  - miniflare@3.20240320.1

## 0.1.7

### Patch Changes

- Updated dependencies [[`5bd8db8`](https://github.com/cloudflare/workers-sdk/commit/5bd8db82a64f2c4ffab1b059b240ba6e6eaafde1), [`e11e169`](https://github.com/cloudflare/workers-sdk/commit/e11e1691a0748c5d6520dc6c2d3d796886ea931f), [`7c701bf`](https://github.com/cloudflare/workers-sdk/commit/7c701bf75731646860be10f2515d9944c7e32361)]:
  - wrangler@3.39.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`7d160c7`](https://github.com/cloudflare/workers-sdk/commit/7d160c7fcaa8097aa3bd8b80b866ec80233be1e9), [`528c011`](https://github.com/cloudflare/workers-sdk/commit/528c011617243d1a290950e76bb88d0986a20f6a), [`7d160c7`](https://github.com/cloudflare/workers-sdk/commit/7d160c7fcaa8097aa3bd8b80b866ec80233be1e9), [`f5e2367`](https://github.com/cloudflare/workers-sdk/commit/f5e2367288e7f57365ef8a1373bbc404bb50a662), [`3be826f`](https://github.com/cloudflare/workers-sdk/commit/3be826f8411ef8d517d572f25a6be38cb8c12cc1), [`528c011`](https://github.com/cloudflare/workers-sdk/commit/528c011617243d1a290950e76bb88d0986a20f6a), [`ba52208`](https://github.com/cloudflare/workers-sdk/commit/ba52208147307608a1233157423e5887203e4547)]:
  - wrangler@3.38.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`bdc121d`](https://github.com/cloudflare/workers-sdk/commit/bdc121de0a05aaa4716269e2a96b3c4ae3385d8e), [`248a318`](https://github.com/cloudflare/workers-sdk/commit/248a318acac293615327affe35b83018a48dddc9), [`e88ad44`](https://github.com/cloudflare/workers-sdk/commit/e88ad444f2dc54bbf4af4ac8d054ab6cd1af6898), [`9fd7eba`](https://github.com/cloudflare/workers-sdk/commit/9fd7eba3f2b526530b6934a613174541ba321eca)]:
  - wrangler@3.37.0
  - miniflare@3.20240320.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`c60fed0`](https://github.com/cloudflare/workers-sdk/commit/c60fed09f3ba3260f182f9d2e6c7c6d0bb123eac), [`e739b7f`](https://github.com/cloudflare/workers-sdk/commit/e739b7fecfb6f3f99a50091be4b7bcd44fdbaa71), [`ac93411`](https://github.com/cloudflare/workers-sdk/commit/ac93411fdb124a784736db704d40592cde227535), [`bfc4282`](https://github.com/cloudflare/workers-sdk/commit/bfc4282de58066d5a9ab07d3e8419ed12b927a96), [`93150aa`](https://github.com/cloudflare/workers-sdk/commit/93150aa0ee51dc3db0c15b6a7126fca11bc2ba0f)]:
  - wrangler@3.36.0

## 0.1.3

### Patch Changes

- [#5261](https://github.com/cloudflare/workers-sdk/pull/5261) [`4618fb0`](https://github.com/cloudflare/workers-sdk/commit/4618fb0060d5963be0859156437032ae3f5227f7) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: link [migration guide](https://developers.cloudflare.com/workers/testing/vitest-integration/get-started/migrate-from-miniflare-2/) when `environment: "miniflare"` is specified in Vitest configuration

- Updated dependencies [[`133a190`](https://github.com/cloudflare/workers-sdk/commit/133a1907087741a4ea3cda7f53ce93919168e8f8), [`0a86050`](https://github.com/cloudflare/workers-sdk/commit/0a860507e49329d0e140de47830d670397e08c13), [`e1f2576`](https://github.com/cloudflare/workers-sdk/commit/e1f2576e1511a53786cebcde12d8c2cf4b3ce566), [`1720f0a`](https://github.com/cloudflare/workers-sdk/commit/1720f0a12a6376093b3c5799d74f47c522ae8571), [`a676f55`](https://github.com/cloudflare/workers-sdk/commit/a676f55a457a8b34b1c80f666f615eb258ad58c4), [`8f79981`](https://github.com/cloudflare/workers-sdk/commit/8f799812a3de1c93fb4dcb7a2a89e60c2c0173cd)]:
  - wrangler@3.35.0
  - miniflare@3.20240314.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`a0768bc`](https://github.com/cloudflare/workers-sdk/commit/a0768bcc9d76be8a88fe3e1aa45f3b3805da3df6)]:
  - wrangler@3.34.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`2e50d51`](https://github.com/cloudflare/workers-sdk/commit/2e50d51632dfe905bd32de8176231bb256c88dab)]:
  - miniflare@3.20240304.2
  - wrangler@3.34.1

## 0.1.0

### Minor Changes

- [#5241](https://github.com/cloudflare/workers-sdk/pull/5241) [`ca891e7`](https://github.com/cloudflare/workers-sdk/commit/ca891e783a41053770f278b91f9001c477550743) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: implement Workers Vitest integration

  Introducing the new Workers Vitest integration! The `@cloudflare/vitest-pool-workers` package allows you to write unit and integration tests using Vitest that run inside the Workers runtime. Refer to the [documentation](https://developers.cloudflare.com/workers/testing/vitest-integration/) and [examples](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/) for more information.

### Patch Changes

- Updated dependencies [[`03484c2`](https://github.com/cloudflare/workers-sdk/commit/03484c2d64f42a2820feeec9076dc3f210baf4f9), [`29e8151`](https://github.com/cloudflare/workers-sdk/commit/29e8151bc2235bd13074584df5f90187955123d2), [`4730b6c`](https://github.com/cloudflare/workers-sdk/commit/4730b6c087080d79838d3fd86480d8aff693834a), [`bd935cf`](https://github.com/cloudflare/workers-sdk/commit/bd935cfdf1bebfff53b1817d475b1d36eccec9c0)]:
  - wrangler@3.34.0
