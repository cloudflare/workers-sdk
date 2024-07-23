# @cloudflare/vitest-pool-workers

## 0.4.14

### Patch Changes

- Updated dependencies [[`5462ead`](https://github.com/cloudflare/workers-sdk/commit/5462ead9207459e7547ba571157159c8618d3583), [`3fd94e7`](https://github.com/cloudflare/workers-sdk/commit/3fd94e7c6ed29339797d9376a8b8398724085b66), [`ebc85c3`](https://github.com/cloudflare/workers-sdk/commit/ebc85c362a424778b7f0565217488504bd42964e), [`084d39e`](https://github.com/cloudflare/workers-sdk/commit/084d39e15e35471fabfb789dd280afe16a919fcf)]:
  - wrangler@3.66.0

## 0.4.13

### Patch Changes

- Updated dependencies [[`779c713`](https://github.com/cloudflare/workers-sdk/commit/779c71349ea1c747ff4486e4084024a7e88a05cb), [`957d668`](https://github.com/cloudflare/workers-sdk/commit/957d668947b8b234dd909806065c02db6d1b3a01), [`e7c06d7`](https://github.com/cloudflare/workers-sdk/commit/e7c06d78b14eb89060f431bc4aee8dbc1cc08fa5)]:
  - miniflare@3.20240718.0
  - wrangler@3.65.1

## 0.4.12

### Patch Changes

- Updated dependencies [[`0d32448`](https://github.com/cloudflare/workers-sdk/commit/0d32448fc72521be691dfc87c8ad5f108ddced62), [`25afcb2`](https://github.com/cloudflare/workers-sdk/commit/25afcb2f118fb06526209340b3562703cdae326b), [`d497e1e`](https://github.com/cloudflare/workers-sdk/commit/d497e1e38c58ce740bdccf126bd926456d61ea9f), [`4f524f2`](https://github.com/cloudflare/workers-sdk/commit/4f524f2eb04f38114adff3590386e06db072f6b0), [`eb201a3`](https://github.com/cloudflare/workers-sdk/commit/eb201a3258469f16c3a42dc5f749ecf3d3ecf372), [`8bbd824`](https://github.com/cloudflare/workers-sdk/commit/8bbd824980c5b1a706bb2e7bef4e52206f7097cf), [`db11a0f`](https://github.com/cloudflare/workers-sdk/commit/db11a0fd12d7b048e5f74acab876080f79e393b3), [`e4abed3`](https://github.com/cloudflare/workers-sdk/commit/e4abed3e8f9c46a014a045885da0dea5c4ae8837), [`fa1016c`](https://github.com/cloudflare/workers-sdk/commit/fa1016cffcb0edcc7fa5deef283481a9b1fd527f)]:
  - miniflare@3.20240712.0
  - wrangler@3.65.0

## 0.4.11

### Patch Changes

- Updated dependencies [[`75f7928`](https://github.com/cloudflare/workers-sdk/commit/75f7928b3c19a39468d4f2c49c8fbed9281f55be), [`4b1e5bc`](https://github.com/cloudflare/workers-sdk/commit/4b1e5bcc1dcdbf4c2e4251b066b1f30eec32d8ce), [`7d4a4d0`](https://github.com/cloudflare/workers-sdk/commit/7d4a4d047be4f18312976efb3339ebba28cf0d82)]:
  - wrangler@3.64.0

## 0.4.10

### Patch Changes

- Updated dependencies [[`88313e5`](https://github.com/cloudflare/workers-sdk/commit/88313e50512ffbcfe8717dc60cf83a4d07a7509d), [`75ba960`](https://github.com/cloudflare/workers-sdk/commit/75ba9608faa9e5710fe1dc75b5852ae446696245)]:
  - wrangler@3.63.2

## 0.4.9

### Patch Changes

- Updated dependencies [[`b879ce4`](https://github.com/cloudflare/workers-sdk/commit/b879ce49aff454f9fe34f86886fc97db8ff8083e), [`d993409`](https://github.com/cloudflare/workers-sdk/commit/d9934090594a7101912bd35aacc86ceb4cc15c3a)]:
  - wrangler@3.63.1

## 0.4.8

### Patch Changes

- [#6180](https://github.com/cloudflare/workers-sdk/pull/6180) [`b994604`](https://github.com/cloudflare/workers-sdk/commit/b9946049b0cfe273b8d950f5abcb25ddd386a872) Thanks [@Skye-31](https://github.com/Skye-31)! - Fix: pass env to getBindings to support reading `.dev.vars.{environment}`

  https://github.com/cloudflare/workers-sdk/pull/5612 added support for selecting the environment of config used, but it missed passing it to the code that reads `.dev.vars.{environment}`

  Closes #5641

- Updated dependencies [[`42a7930`](https://github.com/cloudflare/workers-sdk/commit/42a7930c6d81610c14005503c078610f28b9bc33), [`35689ea`](https://github.com/cloudflare/workers-sdk/commit/35689ead46379a50008af3d83ddaae16617cfbd4), [`e048958`](https://github.com/cloudflare/workers-sdk/commit/e048958778bf8c43a0a23c0f555c1538acc32f09), [`7951815`](https://github.com/cloudflare/workers-sdk/commit/795181509a4735b16f426ac02873f04c208116c8), [`4cdad9b`](https://github.com/cloudflare/workers-sdk/commit/4cdad9bf3870519efa46b34ecd928f26bf5cfa0f), [`7ed675e`](https://github.com/cloudflare/workers-sdk/commit/7ed675e3a43cfd996496bf1be2b31d34bde36664), [`b994604`](https://github.com/cloudflare/workers-sdk/commit/b9946049b0cfe273b8d950f5abcb25ddd386a872), [`d03b102`](https://github.com/cloudflare/workers-sdk/commit/d03b10272513e5860c4aab338e2acecd18a990d8), [`02dda3d`](https://github.com/cloudflare/workers-sdk/commit/02dda3d4d130bb9282e73499a78e04945b941ada), [`1568c25`](https://github.com/cloudflare/workers-sdk/commit/1568c251112e06feb1d3d1df844eaa660bb9fbe8), [`4072114`](https://github.com/cloudflare/workers-sdk/commit/4072114c8ba03f35d36d14061d9a9919d61c91d5), [`9466531`](https://github.com/cloudflare/workers-sdk/commit/9466531e858ffe184ad22651a8f67999398f8a55), [`9272ef5`](https://github.com/cloudflare/workers-sdk/commit/9272ef5511c2882aed6525564c1b13c3d4a3f7e5)]:
  - miniflare@3.20240701.0
  - wrangler@3.63.0

## 0.4.7

### Patch Changes

- Updated dependencies [[`1621992`](https://github.com/cloudflare/workers-sdk/commit/162199289d51dbaf3f7a371d777012d0039fbdfb), [`26855f3`](https://github.com/cloudflare/workers-sdk/commit/26855f39ae635feebb9d5768b64494e73d979b47), [`7d02856`](https://github.com/cloudflare/workers-sdk/commit/7d02856ae2cbd90eb94324f9f6fcb44cd2c44059), [`9c7df38`](https://github.com/cloudflare/workers-sdk/commit/9c7df38871b9fcfda4890a00507e6ef149e0cbcd), [`0075621`](https://github.com/cloudflare/workers-sdk/commit/007562109b583adb6ae15bba5f50029735af24e5), [`e2972cf`](https://github.com/cloudflare/workers-sdk/commit/e2972cf2ce785f5d56b1476e30102e05febba320), [`d39d595`](https://github.com/cloudflare/workers-sdk/commit/d39d59589f7fe3102276bad6b93caf10c39e5f20), [`05c5607`](https://github.com/cloudflare/workers-sdk/commit/05c56073b4e8c71ab6e0b287adddddc00d763170)]:
  - wrangler@3.62.0
  - miniflare@3.20240620.0

## 0.4.6

### Patch Changes

- [#6050](https://github.com/cloudflare/workers-sdk/pull/6050) [`a0c3327`](https://github.com/cloudflare/workers-sdk/commit/a0c3327dd63059d3e24085a95f48f8a98605c49f) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more deps

  This is the last of the patches that normalize dependencies across the codebase. In this batch: `ws`, `vitest`, `zod` , `rimraf`, `@types/rimraf`, `ava`, `source-map`, `glob`, `cookie`, `@types/cookie`, `@microsoft/api-extractor`, `@types/mime`, `@types/yargs`, `devtools-protocol`, `@vitest/ui`, `execa`, `strip-ansi`

  This patch also sorts dependencies in every `package.json`

- [#6029](https://github.com/cloudflare/workers-sdk/pull/6029) [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize some dependencies in workers-sdk

  This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).

- [#6079](https://github.com/cloudflare/workers-sdk/pull/6079) [`2e531b4`](https://github.com/cloudflare/workers-sdk/commit/2e531b4f6f791fee4afb12051ef33f37011e82a6) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: define `defineWorkersConfig` using overload signatures

  The type definition of `defineWorkersConfig` doesn't work with `mergeConfig` of `vitest/config` because of type mismatch.
  This function should be an overload function like `defineConfig`

- Updated dependencies [[`dc597a3`](https://github.com/cloudflare/workers-sdk/commit/dc597a38218b428141c55c4e65633953c87ed180), [`15aff8f`](https://github.com/cloudflare/workers-sdk/commit/15aff8f6e6ce533f25495193e702a6bec76fa81c), [`b4c0233`](https://github.com/cloudflare/workers-sdk/commit/b4c02333829c2312f883e897f812f9877dba603a), [`a0c3327`](https://github.com/cloudflare/workers-sdk/commit/a0c3327dd63059d3e24085a95f48f8a98605c49f), [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4), [`c643a81`](https://github.com/cloudflare/workers-sdk/commit/c643a8193a3c0739b33d3c0072ae716bc8f1565b), [`31cd51f`](https://github.com/cloudflare/workers-sdk/commit/31cd51f251050b0d6db97857a8d1d5427c855d99), [`db66101`](https://github.com/cloudflare/workers-sdk/commit/db661015d37ce75c021413e3ca7c4f0488790cbc), [`374bc44`](https://github.com/cloudflare/workers-sdk/commit/374bc44cce65e2f83f10452122719d3ab28827b3), [`267761b`](https://github.com/cloudflare/workers-sdk/commit/267761b3f5a60e9ea72067d42302895f9d459460), [`84e6aeb`](https://github.com/cloudflare/workers-sdk/commit/84e6aeb189a4f385c49b7c6d451d0613186b29be)]:
  - wrangler@3.61.0
  - miniflare@3.20240610.1

## 0.4.5

### Patch Changes

- [#6007](https://github.com/cloudflare/workers-sdk/pull/6007) [`335e6e7`](https://github.com/cloudflare/workers-sdk/commit/335e6e760637a9ce184093ee6a1b5934d796d67e) Thanks [@Skye-31](https://github.com/Skye-31)! - fix: improve `runInDurableObject` type

  [#5975](https://github.com/cloudflare/workers-sdk/pull/5975) updated the type for `runInDurableObject` to infer the stub's type correctly for RPC methods, however it used the wrong `DurableObjects` type. This PR fixes the type used to properly support RPC methods.

- Updated dependencies [[`c4146fc`](https://github.com/cloudflare/workers-sdk/commit/c4146fc021cbb0556cc95899184b7a44d58ad77c), [`122ef06`](https://github.com/cloudflare/workers-sdk/commit/122ef0681a8aa5338993cb21f111f84ef5c3a443), [`169a9fa`](https://github.com/cloudflare/workers-sdk/commit/169a9fa260b7cb76cf5ef9e9e29a4fd33af8cf2f), [`53acdbc`](https://github.com/cloudflare/workers-sdk/commit/53acdbc00a95e621d90d225d943c36df41768571)]:
  - miniflare@3.20240610.0
  - wrangler@3.60.3

## 0.4.4

### Patch Changes

- Updated dependencies [[`e6a3d24`](https://github.com/cloudflare/workers-sdk/commit/e6a3d243a73f0101d57e6e35c25585884ebea674)]:
  - wrangler@3.60.2

## 0.4.3

### Patch Changes

- Updated dependencies [[`f1f1834`](https://github.com/cloudflare/workers-sdk/commit/f1f18347ddfff509a58acea2a815c40fe86fd56c)]:
  - wrangler@3.60.1

## 0.4.2

### Patch Changes

- Updated dependencies [[`1e68fe5`](https://github.com/cloudflare/workers-sdk/commit/1e68fe5448ffa4d0551dc7255405983c329235c8), [`e144f63`](https://github.com/cloudflare/workers-sdk/commit/e144f63f8c418c77a3b73d387f7e7d22e8f1f730), [`35b1a2f`](https://github.com/cloudflare/workers-sdk/commit/35b1a2f59bf0849e65782a278463cd0c3d294817), [`21573f4`](https://github.com/cloudflare/workers-sdk/commit/21573f4fd3484145405c5666b4dc9f7338f56887), [`ab95473`](https://github.com/cloudflare/workers-sdk/commit/ab9547380fd6fbc1d20c8dd4211faedbe94e5b33), [`bac79fb`](https://github.com/cloudflare/workers-sdk/commit/bac79fb7379941cd70d3a99d0d2cdb23e2409e50), [`6f83641`](https://github.com/cloudflare/workers-sdk/commit/6f836416446e3c04656d17477bcbbd39386622b5), [`1cc52f1`](https://github.com/cloudflare/workers-sdk/commit/1cc52f14c70112f5257263a4adee0c54add3a00d), [`e648825`](https://github.com/cloudflare/workers-sdk/commit/e6488257f9376d415d970b045d77f0223d2f7884)]:
  - wrangler@3.60.0
  - miniflare@3.20240605.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`bdbb7f8`](https://github.com/cloudflare/workers-sdk/commit/bdbb7f890d3fa5b6fa7ac79a3bb650ece9417fb2), [`bf803d7`](https://github.com/cloudflare/workers-sdk/commit/bf803d74c2bd1fc9f6e090bad08db09c6ff88246)]:
  - miniflare@3.20240524.2
  - wrangler@3.59.0

## 0.4.0

### Minor Changes

- [#5916](https://github.com/cloudflare/workers-sdk/pull/5916) [`e42f320`](https://github.com/cloudflare/workers-sdk/commit/e42f32071871b0208e9f00cfd7078d8a5c03fe38) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feature: add support for JSRPC

### Patch Changes

- Updated dependencies [[`9e4d8bc`](https://github.com/cloudflare/workers-sdk/commit/9e4d8bcb8811b9dc2570de26660baa4361a52749), [`e0e7725`](https://github.com/cloudflare/workers-sdk/commit/e0e772575c079787f56615ec3d7a6a4af0633b5a), [`93b98cb`](https://github.com/cloudflare/workers-sdk/commit/93b98cb7e2ba5f73acbc20b4a3ca9a404a37a5dc), [`8e5e589`](https://github.com/cloudflare/workers-sdk/commit/8e5e5897f0de5f8a4990f88165d7a963018a06ef)]:
  - wrangler@3.58.0
  - miniflare@3.20240524.1

## 0.3.0

### Minor Changes

- [#5900](https://github.com/cloudflare/workers-sdk/pull/5900) [`5bf0a6b`](https://github.com/cloudflare/workers-sdk/commit/5bf0a6b7fa365305143f0d1ce1426bb55bc3a085) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - feature: add support for testing Pages Functions

### Patch Changes

- [#5904](https://github.com/cloudflare/workers-sdk/pull/5904) [`c36fb59`](https://github.com/cloudflare/workers-sdk/commit/c36fb59a1bf905b8847659cc87b1b625849f0bdc) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: automatically re-run `SELF` tests without `import <main>`

  By injecting a side-effect only import into tests when there is a `main` field specified
  we can get Vitest to "know" when the SELF Worker has been modified and re-run tests automatically.

- [#5911](https://github.com/cloudflare/workers-sdk/pull/5911) [`8cb0ee7`](https://github.com/cloudflare/workers-sdk/commit/8cb0ee7fc7a84ab34bcb2a05b690a7bc2899005d) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure `console.log()`s displayed in `SELF` integration tests

- Updated dependencies [[`53f22a0`](https://github.com/cloudflare/workers-sdk/commit/53f22a086837df7130d165fe9243f2d1f1559d73), [`57daae0`](https://github.com/cloudflare/workers-sdk/commit/57daae0b2bd70c4f25b2abcabfc7fb03dba0c878), [`a905f31`](https://github.com/cloudflare/workers-sdk/commit/a905f318166a9ceac1fb70487b3a47e5f4158780), [`64ccdd6`](https://github.com/cloudflare/workers-sdk/commit/64ccdd6a6777c5fd85116af0d660cb3ee2e1de4d), [`4458a9e`](https://github.com/cloudflare/workers-sdk/commit/4458a9ea1a2b7748d6066557f48f68ec430d383b)]:
  - wrangler@3.57.2
  - miniflare@3.20240524.0

## 0.2.12

### Patch Changes

- Updated dependencies [[`f2ceb3a`](https://github.com/cloudflare/workers-sdk/commit/f2ceb3a5b993fa56782a6fdf39cd73dbe5c30c83), [`441a05f`](https://github.com/cloudflare/workers-sdk/commit/441a05f4df10e73405a23031cd6a20073d0e15e6), [`d5e00e4`](https://github.com/cloudflare/workers-sdk/commit/d5e00e4a61a4232ebe01069a753ecb642c272b5d), [`a12b031`](https://github.com/cloudflare/workers-sdk/commit/a12b031e4157728e9b6e70667c16481fa32f401e)]:
  - wrangler@3.57.1

## 0.2.11

### Patch Changes

- [#5838](https://github.com/cloudflare/workers-sdk/pull/5838) [`609debd`](https://github.com/cloudflare/workers-sdk/commit/609debdf744569278a050070846e420ffbfac161) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: update undici to the latest version to avoid a potential vulnerability

- Updated dependencies [[`7e97ba8`](https://github.com/cloudflare/workers-sdk/commit/7e97ba8778be3cf1d93d44ed191748853c6661e0), [`609debd`](https://github.com/cloudflare/workers-sdk/commit/609debdf744569278a050070846e420ffbfac161), [`63f7acb`](https://github.com/cloudflare/workers-sdk/commit/63f7acb37e7e7ceb60594ac91baf95cd30037d76), [`2869e03`](https://github.com/cloudflare/workers-sdk/commit/2869e0379667d755d1de5543cb80886cc42c211f), [`86a6e09`](https://github.com/cloudflare/workers-sdk/commit/86a6e09d8a369a3bb8aee8c252174bd01e090c54), [`df2daf2`](https://github.com/cloudflare/workers-sdk/commit/df2daf2c858229fd812bf1fe818b206ef1345a00)]:
  - wrangler@3.57.0

## 0.2.10

### Patch Changes

- Updated dependencies [[`0725f6f`](https://github.com/cloudflare/workers-sdk/commit/0725f6f73199daf7f11eec9830bc4d1f66c05d62), [`9627cef`](https://github.com/cloudflare/workers-sdk/commit/9627cef2f1aadb44aa677e429b6cb6af9c8ee495), [`151bc3d`](https://github.com/cloudflare/workers-sdk/commit/151bc3d31cb970a8caa84fad687c8b1b47ced73f), [`89b6d7f`](https://github.com/cloudflare/workers-sdk/commit/89b6d7f3832b350b470a981eb3b4388517612363)]:
  - miniflare@3.20240512.0
  - wrangler@3.56.0

## 0.2.9

### Patch Changes

- [#5458](https://github.com/cloudflare/workers-sdk/pull/5458) [`f520a71`](https://github.com/cloudflare/workers-sdk/commit/f520a71201c85a2ef3c071eff017816611b37c55) Thanks [@Cherry](https://github.com/Cherry)! - fix: loosen the peer dependency version on vitest to support versions ranging from 1.3.0 to 1.5.0

- Updated dependencies []:
  - wrangler@3.55.0

## 0.2.8

### Patch Changes

- Updated dependencies [[`66bdad0`](https://github.com/cloudflare/workers-sdk/commit/66bdad08834b403100d1e4d6cd507978cc50eaba), [`97741db`](https://github.com/cloudflare/workers-sdk/commit/97741dbf8ff7498bcaa381361d61ad17af10f088), [`f673c66`](https://github.com/cloudflare/workers-sdk/commit/f673c66373e2acd8d9cc94d5afa87b07dd3d750c), [`9b4af8a`](https://github.com/cloudflare/workers-sdk/commit/9b4af8a59bc75ed494dd752c0a7007dbacf75e51)]:
  - miniflare@3.20240419.1
  - wrangler@3.55.0

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
