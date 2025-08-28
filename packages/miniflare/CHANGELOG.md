# miniflare

## 4.20250823.1

### Patch Changes

- [#10437](https://github.com/cloudflare/workers-sdk/pull/10437) [`452ad0b`](https://github.com/cloudflare/workers-sdk/commit/452ad0b1ec58c8078084e0946bf1b3e6ab7f307f) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Loosen validation around different configurations for Durable Object

  Allow durable objects to have `enableSql`, `unsafeUniqueKey` and `unsafePreventEviction` configurations set to `undefined` even if the same durable objects are defined with those configurations set to different values (this allows workers using external durable objects not to have to duplicate such configurations in their options)

## 4.20250823.0

### Patch Changes

- [#10410](https://github.com/cloudflare/workers-sdk/pull/10410) [`f964895`](https://github.com/cloudflare/workers-sdk/commit/f96489502c1282547b6c97af942000867e72b8e7) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250816.0  | 1.20250823.0  |
  | @cloudflare/workers-types | ^4.20250813.0 | ^4.20250823.0 |

## 4.20250816.1

### Minor Changes

- [#10012](https://github.com/cloudflare/workers-sdk/pull/10012) [`4728c68`](https://github.com/cloudflare/workers-sdk/commit/4728c684dad6e91748cdd3f40a216664c53ae007) Thanks [@penalosa](https://github.com/penalosa)! - Support unsafe dynamic worker loading bindings

## 4.20250816.0

### Minor Changes

- [#10357](https://github.com/cloudflare/workers-sdk/pull/10357) [`565c3a3`](https://github.com/cloudflare/workers-sdk/commit/565c3a3ddf381945b0bea6c99029d8783e68f6bb) Thanks [@dom96](https://github.com/dom96)! - Use new default entrypoint handlers for Python examples

- [#10255](https://github.com/cloudflare/workers-sdk/pull/10255) [`ddadb93`](https://github.com/cloudflare/workers-sdk/commit/ddadb9320fef96f52fe010f0e98fd75d5a2925ea) Thanks [@ruifigueira](https://github.com/ruifigueira)! - Add `/v1/session` endpoint for Browser Rendering local mode

### Patch Changes

- [#10249](https://github.com/cloudflare/workers-sdk/pull/10249) [`875197a`](https://github.com/cloudflare/workers-sdk/commit/875197a570edacbf1849a2f3d76c011e9b6f9cbf) Thanks [@penalosa](https://github.com/penalosa)! - Support JSRPC for remote bindings. This unlocks:
  - JSRPC over Service Bindings
  - JSRPC over Dispatch Namespace Bindings
  - Email
  - Pipelines

## 4.20250813.1

### Minor Changes

- [#10349](https://github.com/cloudflare/workers-sdk/pull/10349) [`d54d8b7`](https://github.com/cloudflare/workers-sdk/commit/d54d8b73a2771cde9645937ff241675dddf0e8d2) Thanks [@edmundhung](https://github.com/edmundhung)! - feat: add `unsafeHandleDevRegistryUpdate` callback option to Miniflare

  Adds a new option to Miniflare that allows users to register a callback function that gets invoked whenever the dev registry is updated with changes to external services that the current Worker depends on.

  This callback is useful for scenarios where you need to react to changes in bound services, such as updating bindings tables or reloading configurations when dependent Workers are added, removed, or modified in the dev registry.

  ```typescript
  const mf = new Miniflare({
  	// ... other options
  	unsafeHandleDevRegistryUpdate(registry) {
  		console.log("Dev registry updated:", registry);
  		// Handle registry updates (e.g., reprint bindings, reload config)
  	},
  });
  ```

### Patch Changes

- [#10306](https://github.com/cloudflare/workers-sdk/pull/10306) [`ae0c806`](https://github.com/cloudflare/workers-sdk/commit/ae0c806087c203da6a3d7da450e8fabe0d81c987) Thanks [@ruifigueira](https://github.com/ruifigueira)! - Browser Rendering for local development now uses @puppeteer/browsers package instead of puppeteer

## 4.20250813.0

### Patch Changes

- [#10229](https://github.com/cloudflare/workers-sdk/pull/10229) [`5020694`](https://github.com/cloudflare/workers-sdk/commit/5020694dd35578dcf3f1669780889fc0ba632c8e) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250803.0  | 1.20250813.0  |
  | @cloudflare/workers-types | ^4.20250803.0 | ^4.20250813.0 |

## 4.20250803.1

### Patch Changes

- [#10273](https://github.com/cloudflare/workers-sdk/pull/10273) [`1479fd0`](https://github.com/cloudflare/workers-sdk/commit/1479fd06b91f9ab529ba4b8824d938e5da3184a0) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: support WebSocket proxying to workerd

  The dev registry proxy server now correctly handles WebSocket upgrade requests and
  tunnels bidirectional frames between the workerd processes. Previously,
  handshakes would fail due to missing upgrade logic.

- [#10281](https://github.com/cloudflare/workers-sdk/pull/10281) [`05c5b28`](https://github.com/cloudflare/workers-sdk/commit/05c5b286307bb4b55bd7768bd5873b54f8b06079) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: enable HTTPS support when proxying to workerd

  The Miniflare dev-registry proxy previously assumed workerd would always use HTTP,
  so enabling `https` on miniflare might caused connection failures in some setups.

  This ensures proxying works whether the option is enabled or not.

- [#10142](https://github.com/cloudflare/workers-sdk/pull/10142) [`e3d9703`](https://github.com/cloudflare/workers-sdk/commit/e3d9703c8733567b9bcad4d6264958f6ba6876f6) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: support `mf.getBindings()` when dev registry is enabled

  Fixes a deadlock when using bindings from `mf.getBindings()` with the dev registry enabled. The deadlock happened because the runtime attempted to resolve a worker address via the loopback server, which was blocked by the Node.js thread waiting on the same runtime.

  Address lookup has been moved to a proxy running in a worker thread to avoid blocking the main thread.

## 4.20250803.0

### Minor Changes

- [#10004](https://github.com/cloudflare/workers-sdk/pull/10004) [`b4d1373`](https://github.com/cloudflare/workers-sdk/commit/b4d13733b5f64f84274a194dd725943658d6184e) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `structuredWorkerdLogs` option

  add a new top-level option named `structuredWorkerdLogs` that makes workerd print to stdout structured logs (stringified jsons of the following shape: `{ timestamp: number, level: string, message: string }`) instead of printing logs to stdout and stderr

- [#9556](https://github.com/cloudflare/workers-sdk/pull/9556) [`8ba7736`](https://github.com/cloudflare/workers-sdk/commit/8ba7736a8ae5666870d12945a1cb6185b6ac3633) Thanks [@edmundhung](https://github.com/edmundhung)! - Added a `serviceName` option to `unsafeDirectSockets`

  This allows registering the current worker in the dev registry under its own name, but routing to a different service.

### Patch Changes

- [#10148](https://github.com/cloudflare/workers-sdk/pull/10148) [`631f26d`](https://github.com/cloudflare/workers-sdk/commit/631f26df58d8933da81fb312f2ba2e30dc22821a) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250730.0  | 1.20250801.0  |
  | @cloudflare/workers-types | ^4.20250730.0 | ^4.20250801.0 |

- [#10203](https://github.com/cloudflare/workers-sdk/pull/10203) [`d6ecd05`](https://github.com/cloudflare/workers-sdk/commit/d6ecd05be5d272857f2b3e243e57ddee4e6a576c) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250801.0  | 1.20250803.0  |
  | @cloudflare/workers-types | ^4.20250801.0 | ^4.20250803.0 |

- [#10176](https://github.com/cloudflare/workers-sdk/pull/10176) [`07c8611`](https://github.com/cloudflare/workers-sdk/commit/07c8611b69721e8aa1300ba209dc45a75173e1d7) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Add macOS version validation to prevent EPIPE errors on unsupported macOS versions (below 13.5). Miniflare and C3 fail hard while Wrangler shows warnings but continues execution.

## 4.20250730.0

### Patch Changes

- [#10129](https://github.com/cloudflare/workers-sdk/pull/10129) [`9b61f44`](https://github.com/cloudflare/workers-sdk/commit/9b61f44c899aa6530ecd20f283dc4e2a9f7c79c7) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250726.0  | 1.20250730.0  |
  | @cloudflare/workers-types | ^4.20250726.0 | ^4.20250730.0 |

## 4.20250726.0

### Patch Changes

- [#10075](https://github.com/cloudflare/workers-sdk/pull/10075) [`82a5b2e`](https://github.com/cloudflare/workers-sdk/commit/82a5b2e09fef9046140181c06aba1f82ce8314af) Thanks [@vicb](https://github.com/vicb)! - fix the type of ForwardableEmailMessage

- [#10058](https://github.com/cloudflare/workers-sdk/pull/10058) [`f8f7352`](https://github.com/cloudflare/workers-sdk/commit/f8f735282bdcab25c90b986ff1ae45e20a4625c2) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: service binding fetch over dev registry should work without host header

- [#9968](https://github.com/cloudflare/workers-sdk/pull/9968) [`2df1d06`](https://github.com/cloudflare/workers-sdk/commit/2df1d066cfe376b831ff0b29b656437d869791e5) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250712.0  | 1.20250726.0  |
  | @cloudflare/workers-types | ^4.20250712.0 | ^4.20250726.0 |

## 4.20250712.2

### Minor Changes

- [#9971](https://github.com/cloudflare/workers-sdk/pull/9971) [`19794bf`](https://github.com/cloudflare/workers-sdk/commit/19794bfb57a3ab17433eefbe1820d21d98bc32a4) Thanks [@edmundhung](https://github.com/edmundhung)! - feat: add stripDisablePrettyError option to control whether the header is stripped

- [#10041](https://github.com/cloudflare/workers-sdk/pull/10041) [`059a39e`](https://github.com/cloudflare/workers-sdk/commit/059a39e4f1e9f9b55ed8a5a8598e35af9bd0357f) Thanks [@ruifigueira](https://github.com/ruifigueira)! - Add @cloudflare/plywright support for Browser Rendering local mode

## 4.20250712.1

### Patch Changes

- [#9866](https://github.com/cloudflare/workers-sdk/pull/9866) [`7e5585d`](https://github.com/cloudflare/workers-sdk/commit/7e5585dbf844fda0e1688797ce31c7e634f3f4ba) Thanks [@invisal](https://github.com/invisal)! - Fix D1 SQL dump generation: escape identifiers and handle SQLite's dynamic typing

  Escape column and table names to prevent SQL syntax errors.
  Escape values based on their runtime type to support SQLite's flexible typing.

## 4.20250712.0

### Minor Changes

- [#9843](https://github.com/cloudflare/workers-sdk/pull/9843) [`5b0fc9e`](https://github.com/cloudflare/workers-sdk/commit/5b0fc9e96b97e935fa8e60ba442a9d706753ebd4) Thanks [@edmundhung](https://github.com/edmundhung)! - Improved error logging to include error causes in stack traces with internal stack frames removed.

### Patch Changes

- [#9854](https://github.com/cloudflare/workers-sdk/pull/9854) [`ac08e68`](https://github.com/cloudflare/workers-sdk/commit/ac08e6886a10c7cff4cf02002dffe961f5f157b9) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix incorrect bindings remote deduplication logic

  when bindings are registered deduplication logic is applied to make sure that the same binding is not unnecessarily registered multiple times, the changes here fix the fact that such deduplication logic doesn't currently take into account whether bindings are used or not in remote mode (which is problematic when the same binding is used both in remote and local mode)

- [#9912](https://github.com/cloudflare/workers-sdk/pull/9912) [`3bb69fa`](https://github.com/cloudflare/workers-sdk/commit/3bb69fae168a7254c0eb396ea90cc274d0d9ce92) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250709.0  | 1.20250710.0  |
  | @cloudflare/workers-types | ^4.20250709.0 | ^4.20250710.0 |

- [#9930](https://github.com/cloudflare/workers-sdk/pull/9930) [`274a826`](https://github.com/cloudflare/workers-sdk/commit/274a826b3349211e8722baab2d73cdaab3b3aa5d) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250710.0  | 1.20250711.0  |
  | @cloudflare/workers-types | ^4.20250710.0 | ^4.20250711.0 |

- [#9950](https://github.com/cloudflare/workers-sdk/pull/9950) [`77d1cb2`](https://github.com/cloudflare/workers-sdk/commit/77d1cb23761e258720956c0d5d72fb778cf80d42) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250711.0  | 1.20250712.0  |
  | @cloudflare/workers-types | ^4.20250711.0 | ^4.20250712.0 |

- [#9954](https://github.com/cloudflare/workers-sdk/pull/9954) [`bf4c9ab`](https://github.com/cloudflare/workers-sdk/commit/bf4c9abda7ec70f8633884987db36be2cf1b7e1e) Thanks [@penalosa](https://github.com/penalosa)! - Support Images binding in `getPlatformProxy()`

- [#9847](https://github.com/cloudflare/workers-sdk/pull/9847) [`14ce577`](https://github.com/cloudflare/workers-sdk/commit/14ce5775c775b32bc1166d4e7a1546a00c049ab0) Thanks [@penalosa](https://github.com/penalosa)! - Upgrade Undici

## 4.20250709.0

### Patch Changes

- [#9881](https://github.com/cloudflare/workers-sdk/pull/9881) [`bb09e50`](https://github.com/cloudflare/workers-sdk/commit/bb09e50d8e7f823172f3e492ca111157a105adb1) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250705.0  | 1.20250708.0  |
  | @cloudflare/workers-types | ^4.20250705.0 | ^4.20250708.0 |

- [#9894](https://github.com/cloudflare/workers-sdk/pull/9894) [`25dbe54`](https://github.com/cloudflare/workers-sdk/commit/25dbe5480dd1d14ee25b38fc5e0105f938b1ee5b) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250708.0  | 1.20250709.0  |
  | @cloudflare/workers-types | ^4.20250708.0 | ^4.20250709.0 |

- [#9876](https://github.com/cloudflare/workers-sdk/pull/9876) [`3bdec6b`](https://github.com/cloudflare/workers-sdk/commit/3bdec6b768a0b68560ad6d24274007de3a7fbc26) Thanks [@edmundhung](https://github.com/edmundhung)! - chore: update youch version

## 4.20250705.0

### Minor Changes

- [#9796](https://github.com/cloudflare/workers-sdk/pull/9796) [`ba69586`](https://github.com/cloudflare/workers-sdk/commit/ba69586d8f8ad5ea68e42e4feb47994f4503c376) Thanks [@simonabadoiu](https://github.com/simonabadoiu)! - Browser Rendering local mode

### Patch Changes

- [#9784](https://github.com/cloudflare/workers-sdk/pull/9784) [`1a75f85`](https://github.com/cloudflare/workers-sdk/commit/1a75f85ae9893bd0ee8c8dba77d4d1be104a527c) Thanks [@Mkassabov](https://github.com/Mkassabov)! - fix inspector proxy not proxying workers created via setOptions

- [#9757](https://github.com/cloudflare/workers-sdk/pull/9757) [`395f36d`](https://github.com/cloudflare/workers-sdk/commit/395f36de127c6ee5fbc0ceadbfb508f7f32f5388) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250617.0  | 1.20250705.0  |
  | @cloudflare/workers-types | ^4.20250617.0 | ^4.20250705.0 |

- [#9855](https://github.com/cloudflare/workers-sdk/pull/9855) [`6f344bf`](https://github.com/cloudflare/workers-sdk/commit/6f344bfe3179477a75c61d504bf69ede05d103ab) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - use logger (and log level) from miniflare for asset metadata parsing/loading logs

## 4.20250617.5

### Minor Changes

- [#9535](https://github.com/cloudflare/workers-sdk/pull/9535) [`56dc5c4`](https://github.com/cloudflare/workers-sdk/commit/56dc5c4946417df12688dd6b2374835f60c14be6) Thanks [@penalosa](https://github.com/penalosa)! - In 2023 we announced [breakpoint debugging support](https://blog.cloudflare.com/debugging-cloudflare-workers/) for Workers, which meant that you could easily debug your Worker code in Wrangler's built-in devtools (accessible via the `[d]` hotkey) as well as multiple other devtools clients, [including VSCode](https://developers.cloudflare.com/workers/observability/dev-tools/breakpoints/). For most developers, breakpoint debugging via VSCode is the most natural flow, but until now it's required [manually configuring a `launch.json` file](https://developers.cloudflare.com/workers/observability/dev-tools/breakpoints/#setup-vs-code-to-use-breakpoints), running `wrangler dev`, and connecting via VSCode's built-in debugger.

  Now, using VSCode's built-in [JavaScript Debug Terminals](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_javascript-debug-terminal), there are just two steps: open a JS debug terminal and run `wrangler dev` (or `vite dev`). VSCode will automatically connect to your running Worker (even if you're running multiple Workers at once!) and start a debugging session.

## 4.20250617.4

### Patch Changes

- [#9689](https://github.com/cloudflare/workers-sdk/pull/9689) [`b137a6f`](https://github.com/cloudflare/workers-sdk/commit/b137a6f090b952f7e34236fa86b6667ca895f601) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: correctly pass container engine config to miniflare

## 4.20250617.3

### Minor Changes

- [#9640](https://github.com/cloudflare/workers-sdk/pull/9640) [`bfb791e`](https://github.com/cloudflare/workers-sdk/commit/bfb791e708706c643d088864a5226b23b0f45d7e) Thanks [@emily-shen](https://github.com/emily-shen)! - Add ability to dump workerd config into a file for debugging.

  You can enable this by setting `MINIFLARE_WORKERD_CONFIG_DEBUG` to a file path where you want the config to be written.

### Patch Changes

- [#9596](https://github.com/cloudflare/workers-sdk/pull/9596) [`5162c51`](https://github.com/cloudflare/workers-sdk/commit/5162c5194604f26b2e5018961b761f3450872333) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - add ability to pull images for containers local dev

## 4.20250617.2

### Patch Changes

- [#9605](https://github.com/cloudflare/workers-sdk/pull/9605) [`17d23d8`](https://github.com/cloudflare/workers-sdk/commit/17d23d8e5fd54737d1c4b9cb487fd6e85cddc9c8) Thanks [@emily-shen](https://github.com/emily-shen)! - Add rebuild hotkey for containers local dev, and clean up containers at the end of a dev session.

## 4.20250617.1

### Patch Changes

- [#9586](https://github.com/cloudflare/workers-sdk/pull/9586) [`d1d34fe`](https://github.com/cloudflare/workers-sdk/commit/d1d34fedd1276803223830b8d6670c1b21e72308) Thanks [@penalosa](https://github.com/penalosa)! - Remove the Mixed Mode naming in favour of "remote bindings"/"remote proxy"

## 4.20250617.0

### Patch Changes

- [#9591](https://github.com/cloudflare/workers-sdk/pull/9591) [`828b7df`](https://github.com/cloudflare/workers-sdk/commit/828b7dffada8c4b5ea77d3ccddb923815c19671d) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250612.0  | 1.20250617.0  |
  | @cloudflare/workers-types | ^4.20250612.0 | ^4.20250617.0 |

- [#9576](https://github.com/cloudflare/workers-sdk/pull/9576) [`2671e77`](https://github.com/cloudflare/workers-sdk/commit/2671e778435b9e3380c0d34718824409be494c33) Thanks [@vicb](https://github.com/vicb)! - Add core local dev functionality for containers.
  Adds a new WRANGLER_DOCKER_HOST env var to customise what socket to connect to.

## 4.20250612.0

### Patch Changes

- [#9529](https://github.com/cloudflare/workers-sdk/pull/9529) [`bd528d5`](https://github.com/cloudflare/workers-sdk/commit/bd528d5d53a473b8339574290da0c47797c3b322) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250604.0  | 1.20250612.0  |
  | @cloudflare/workers-types | ^4.20250604.0 | ^4.20250612.0 |

- [#9582](https://github.com/cloudflare/workers-sdk/pull/9582) [`2177fb4`](https://github.com/cloudflare/workers-sdk/commit/2177fb44f43357d349ff2e2cc4b40d72c929e491) Thanks [@vicb](https://github.com/vicb)! - Update capnp generated code from the workerd.capnp

- [#9506](https://github.com/cloudflare/workers-sdk/pull/9506) [`36113c2`](https://github.com/cloudflare/workers-sdk/commit/36113c29c8d2338fcd7a6da19f4c59c7e9f65a3b) Thanks [@penalosa](https://github.com/penalosa)! - Strip the `CF-Connecting-IP` header from outgoing fetches

- [#9493](https://github.com/cloudflare/workers-sdk/pull/9493) [`e16fcc7`](https://github.com/cloudflare/workers-sdk/commit/e16fcc747aa7701405eb4f49a73e622425f67527) Thanks [@vicb](https://github.com/vicb)! - bump capnp-es to 0.0.11 in miniflare

## 4.20250604.1

### Minor Changes

- [#9509](https://github.com/cloudflare/workers-sdk/pull/9509) [`0b2ba45`](https://github.com/cloudflare/workers-sdk/commit/0b2ba4590ca59f1d95d7262e64adeefebe6a3e7e) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add static routing options via 'run_worker_first' to Wrangler

  Implements the proposal noted here https://github.com/cloudflare/workers-sdk/discussions/9143.

  This is now usable in `wrangler dev` and in production - just specify the routes that should hit the worker first with `run_worker_first` in your Wrangler config. You can also omit certain paths with `!` negative rules.

### Patch Changes

- [#9475](https://github.com/cloudflare/workers-sdk/pull/9475) [`931f467`](https://github.com/cloudflare/workers-sdk/commit/931f467e39f70abfd0e1c08172f330e6e3de02a3) Thanks [@edmundhung](https://github.com/edmundhung)! - add hello world binding that serves as as an explanatory example.

- [#9443](https://github.com/cloudflare/workers-sdk/pull/9443) [`95eb47d`](https://github.com/cloudflare/workers-sdk/commit/95eb47d2c6adcff9a475c0cd507a72bd2e83f3b1) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add mixed-mode support for mtls bindings

## 4.20250604.0

### Patch Changes

- [#9508](https://github.com/cloudflare/workers-sdk/pull/9508) [`4ab5a40`](https://github.com/cloudflare/workers-sdk/commit/4ab5a4027d8a180e8ed300bc63d4d4d41848bcd5) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: ensure default registry path matches wrangler settings"

- [#9385](https://github.com/cloudflare/workers-sdk/pull/9385) [`485cd08`](https://github.com/cloudflare/workers-sdk/commit/485cd08679eaa3a47e9951c708b80f5c33a0a097) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250525.0  | 1.20250604.0  |
  | @cloudflare/workers-types | ^4.20250525.0 | ^4.20250604.0 |

- [#9469](https://github.com/cloudflare/workers-sdk/pull/9469) [`e3b3ef5`](https://github.com/cloudflare/workers-sdk/commit/e3b3ef51cfbdb5ffa15ebe81656460c340a2bba4) Thanks [@edmundhung](https://github.com/edmundhung)! - refactor: the dev registry will now create a file watcher only when the Worker has a binding to external services.

## 4.20250525.1

### Minor Changes

- [#9173](https://github.com/cloudflare/workers-sdk/pull/9173) [`fac2f9d`](https://github.com/cloudflare/workers-sdk/commit/fac2f9dfa67b9c9b3ab0979acbb79f8e020a9cfb) Thanks [@edmundhung](https://github.com/edmundhung)! - feat: export `getDefaultDevRegistryPath()` utility

  This provides a default XDG app-path for the Dev Registry, which can be used to set the `unsafeDevRegistryPath` option in Miniflare and will be used by both Wrangler and @cloudflare/vite-plugin.

- [#9313](https://github.com/cloudflare/workers-sdk/pull/9313) [`92719a5`](https://github.com/cloudflare/workers-sdk/commit/92719a535bf6bae9d660a05d5c8f8823004929c5) Thanks [@edmundhung](https://github.com/edmundhung)! - feat: add Dev Registry support

  This change introduces two new options to support cross-process service bindings, durable objects and tail consumers via a file-system based registry, with backward compatibility to Wrangler’s implementation:

  - **`unsafeDevRegistryPath`** (`string`): Filesystem path to the Dev Registry directory.
  - **`unsafeDevRegistryDurableObjectProxy`** (`boolean`): When enabled, exposes internal Durable Objects to other local dev sessions and allows Workers to connect to external Durable Objects.

  Example usage:

  ```ts
  import { Miniflare } from "miniflare";

  const mf = new Miniflare({
  	scriptPath: "./dist/worker.js",
  	unsafeDevRegistryPath: "/registry",
  	unsafeDevRegistryDurableObjectProxy: true,
  	// ...other options
  });
  ```

### Patch Changes

- [#9440](https://github.com/cloudflare/workers-sdk/pull/9440) [`8c7ce77`](https://github.com/cloudflare/workers-sdk/commit/8c7ce7728ccc467aa19b60c8f32c90e6f06442d1) Thanks [@penalosa](https://github.com/penalosa)! - Preserve original error messages

- [#9390](https://github.com/cloudflare/workers-sdk/pull/9390) [`80e75f4`](https://github.com/cloudflare/workers-sdk/commit/80e75f4a67b4e4b7a1bc92e0a93659e5d6f141dc) Thanks [@penalosa](https://github.com/penalosa)! - Support additional Mixed Mode resources in Wrangler:

  - AI
  - Browser
  - Images
  - Vectorize
  - Dispatch Namespaces

- [#9390](https://github.com/cloudflare/workers-sdk/pull/9390) [`80e75f4`](https://github.com/cloudflare/workers-sdk/commit/80e75f4a67b4e4b7a1bc92e0a93659e5d6f141dc) Thanks [@penalosa](https://github.com/penalosa)! - Additional option for the Miniflare plugin interface to allow defining workerd extensions without having to include deduplication logic.

## 4.20250525.0

### Minor Changes

- [#9387](https://github.com/cloudflare/workers-sdk/pull/9387) [`e39a45f`](https://github.com/cloudflare/workers-sdk/commit/e39a45ffa0d783cc99107f8ab02d6b3dd27d4c9f) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add `logReady` method to Miniflare `Log` class. This makes it possible to override the messages printed on server start.

- [#9376](https://github.com/cloudflare/workers-sdk/pull/9376) [`fdae3f7`](https://github.com/cloudflare/workers-sdk/commit/fdae3f7665a5cd3b5e25c9de19156ecd54618a7c) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Add support for Node.js style custom handlers for service bindings and outbound services. This makes it easier to integrate Miniflare with existing Node.js middleware and libraries as `req` and `res` objects can be used directly.

  ```js
  new Miniflare({
  	serviceBindings: {
  		CUSTOM: {
  			node: (req, res) => {
  				res.end(`Hello world`);
  			},
  		},
  	},
  });
  ```

### Patch Changes

- [#9366](https://github.com/cloudflare/workers-sdk/pull/9366) [`d9d937a`](https://github.com/cloudflare/workers-sdk/commit/d9d937ab6f2868271dde5a8da625773085eaec85) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250523.0  | 1.20250525.0  |
  | @cloudflare/workers-types | ^4.20250523.0 | ^4.20250525.0 |

## 4.20250523.0

### Minor Changes

- [#9330](https://github.com/cloudflare/workers-sdk/pull/9330) [`34c71ce`](https://github.com/cloudflare/workers-sdk/commit/34c71ce9208ffceefe718fc9ae7282ef95e2f2be) Thanks [@edmundhung](https://github.com/edmundhung)! - Add a new `defaultPersistRoot` option to control where plugins persist data when no path is provided.

  ```js
  // Before this change / No `defaultPersistRoot`
  new Miniflare({
  	kvPersist: undefined, // → "/(tmp)/kv"
  	d1Persist: true, // → "$PWD/.mf/d1"
  	r2Persist: false, // → "/(tmp)/r2"
  	cachePersist: "/my-cache", // → "/my-cache"
  });

  // With `defaultPersistRoot`
  new Miniflare({
  	defaultPersistRoot: "/storage",
  	kvPersist: undefined, // → "/storage/kv"
  	d1Persist: true, // → "/storage/d1"
  	r2Persist: false, // → "/(tmp)/r2"
  	cachePersist: "/my-cache", // → "/my-cache"
  });
  ```

### Patch Changes

- [#9184](https://github.com/cloudflare/workers-sdk/pull/9184) [`f7c82a4`](https://github.com/cloudflare/workers-sdk/commit/f7c82a4a9f1cb1c9abf6d309327a72b5423e44b1) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250508.0  | 1.20250520.0  |
  | @cloudflare/workers-types | ^4.20250508.0 | ^4.20250520.0 |

- [#9346](https://github.com/cloudflare/workers-sdk/pull/9346) [`7ddd865`](https://github.com/cloudflare/workers-sdk/commit/7ddd865fa61b65851149e3d1ac8753002b648e65) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250520.0  | 1.20250523.0  |
  | @cloudflare/workers-types | ^4.20250520.0 | ^4.20250523.0 |

- [#9335](https://github.com/cloudflare/workers-sdk/pull/9335) [`6479fc5`](https://github.com/cloudflare/workers-sdk/commit/6479fc5228d1249e87c7f668e8efbf88ec5a8f5f) Thanks [@penalosa](https://github.com/penalosa)! - Redesign `wrangler dev` to more clearly present information and have a bit of a glow up ✨
  ![Screenshot 2025-05-22 at 01 11 43](https://github.com/user-attachments/assets/26cc6209-37a1-4ecb-8e91-daac2f79a095)

- [#9106](https://github.com/cloudflare/workers-sdk/pull/9106) [`e5ae13a`](https://github.com/cloudflare/workers-sdk/commit/e5ae13adebe5ee139cf2c91f0a3bd5992cfd3923) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: decouple KV plugin from secrets store plugin

  The KV plugin previously configured both KV namespace and secrets store bindings with the same service name but different persistence paths, causing conflicts when both were defined. This change copies the KV binding implementation into the secrets store plugin and customizes its service name to prevent collisions.

## 4.20250508.3

### Patch Changes

- [#9277](https://github.com/cloudflare/workers-sdk/pull/9277) [`db5ea8f`](https://github.com/cloudflare/workers-sdk/commit/db5ea8f1f657c29edd62becb839a6e010324d5fb) Thanks [@penalosa](https://github.com/penalosa)! - Support Mixed Mode for more binding types

- [#9245](https://github.com/cloudflare/workers-sdk/pull/9245) [`b87b472`](https://github.com/cloudflare/workers-sdk/commit/b87b472a1a06419c1ded539fa478fa69a688efba) Thanks [@penalosa](https://github.com/penalosa)! - Support Mixed Mode Dispatch Namespaces

## 4.20250508.2

### Patch Changes

- [#9256](https://github.com/cloudflare/workers-sdk/pull/9256) [`3b384e2`](https://github.com/cloudflare/workers-sdk/commit/3b384e28c7b2c2be1bf959831ad538c56f2a8c8a) Thanks [@penalosa](https://github.com/penalosa)! - Move the Analytics Engine simulator implementation from JSRPC to a Wrapped binding. This fixes a regression introduced in https://github.com/cloudflare/workers-sdk/pull/8935 that preventing Analytics Engine bindings working in local dev for Workers with a compatibility date prior to JSRPC being enabled.

## 4.20250508.1

### Patch Changes

- [#9246](https://github.com/cloudflare/workers-sdk/pull/9246) [`d033a7d`](https://github.com/cloudflare/workers-sdk/commit/d033a7da1c5b918d4e3bd2ea53bc0f0d20817715) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: strip `CF-Connecting-IP` header within `fetch`

  In v4.15.0, Miniflare began stripping the `CF-Connecting-IP` header via a global outbound service, which led to a TCP connection regression due to a bug in Workerd. This PR patches the `fetch` API to strip the header during local `wrangler dev` sessions as a temporary workaround until the underlying issue is resolved.

## 4.20250508.0

### Patch Changes

- [#7914](https://github.com/cloudflare/workers-sdk/pull/7914) [`37af035`](https://github.com/cloudflare/workers-sdk/commit/37af03518e59a8af9c66c3b50fa380186d2c098b) Thanks [@andyjessop](https://github.com/andyjessop)! - fix(miniflare): strip CF-Connecting-IP header from all outbound requests

- [#9174](https://github.com/cloudflare/workers-sdk/pull/9174) [`ceeb375`](https://github.com/cloudflare/workers-sdk/commit/ceeb375cac316a6508853511a1ad6ec15d120244) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250507.0  | 1.20250508.0  |
  | @cloudflare/workers-types | ^4.20250507.0 | ^4.20250508.0 |

- [#9181](https://github.com/cloudflare/workers-sdk/pull/9181) [`349cffc`](https://github.com/cloudflare/workers-sdk/commit/349cffcd547e602a4bf3fb708122cf00bb4ad8d2) Thanks [@penalosa](https://github.com/penalosa)! - Add a mixed-mode-only browser rendering plugin

- [#9186](https://github.com/cloudflare/workers-sdk/pull/9186) [`362cb0b`](https://github.com/cloudflare/workers-sdk/commit/362cb0be3fa28bbf007491f7156ecb522bd7ee43) Thanks [@penalosa](https://github.com/penalosa)! - Support Mixed Mode Service Bindings in Miniflare

- [#9198](https://github.com/cloudflare/workers-sdk/pull/9198) [`2cc8197`](https://github.com/cloudflare/workers-sdk/commit/2cc819782c2ebb0d7f852be719c4230d2a7db6ae) Thanks [@kylecarbs](https://github.com/kylecarbs)! - fix: ensure the fetch proxy message port is started

  While Node.js will start the message port automatically when a `message` event listener is added,
  this diverges from the standard Web API for message ports, which require you to explicitly start
  listening on the port.

- [#9168](https://github.com/cloudflare/workers-sdk/pull/9168) [`6b42c28`](https://github.com/cloudflare/workers-sdk/commit/6b42c28aa42457a64e9342b1cd1f92ad2228ff37) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `mixedModeConnectionString` to the various binding configs

## 4.20250507.0

### Patch Changes

- [#9092](https://github.com/cloudflare/workers-sdk/pull/9092) [`df5d1f6`](https://github.com/cloudflare/workers-sdk/commit/df5d1f6104df90e5b991c8d73d9847a64beb9cd2) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250428.0  | 1.20250506.0  |
  | @cloudflare/workers-types | ^4.20250428.0 | ^4.20250506.0 |

- [#9160](https://github.com/cloudflare/workers-sdk/pull/9160) [`4672bda`](https://github.com/cloudflare/workers-sdk/commit/4672bda9fe0d94a5eaea231fc46ca755092a81eb) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250506.0  | 1.20250507.0  |
  | @cloudflare/workers-types | ^4.20250506.0 | ^4.20250507.0 |

- [#9159](https://github.com/cloudflare/workers-sdk/pull/9159) [`c6b3f10`](https://github.com/cloudflare/workers-sdk/commit/c6b3f10f5adf4e6d62bcc9fe89574a2cbcce3870) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - bump esbuild version to fix regression in 0.25.0

## 4.20250428.1

### Patch Changes

- [#9089](https://github.com/cloudflare/workers-sdk/pull/9089) [`357d42a`](https://github.com/cloudflare/workers-sdk/commit/357d42acfb16d21169d004961030cd4822526a96) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: skip comment lines when parsing `NODE_EXTRA_CA_CERTS`

## 4.20250428.0

### Minor Changes

- [#9083](https://github.com/cloudflare/workers-sdk/pull/9083) [`137d2da`](https://github.com/cloudflare/workers-sdk/commit/137d2da0602db0f66a5c1b6f277624f6031d9dc5) Thanks [@penalosa](https://github.com/penalosa)! - Support Tail Workers in local dev

### Patch Changes

- [#9081](https://github.com/cloudflare/workers-sdk/pull/9081) [`d2ecc76`](https://github.com/cloudflare/workers-sdk/commit/d2ecc763e4d77620d6a9be71855e87893631ebc0) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250424.0  | 1.20250428.0  |
  | @cloudflare/workers-types | ^4.20250424.0 | ^4.20250428.0 |

## 4.20250424.1

### Patch Changes

- [#9033](https://github.com/cloudflare/workers-sdk/pull/9033) [`2c50115`](https://github.com/cloudflare/workers-sdk/commit/2c501151d3d1a563681cdb300a298b83862b60e2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - chore: convert wrangler.toml files into wrangler.jsonc ones

## 4.20250424.0

### Patch Changes

- [#9041](https://github.com/cloudflare/workers-sdk/pull/9041) [`fc47c79`](https://github.com/cloudflare/workers-sdk/commit/fc47c79f7c5ab532e0437897c8d7ab06abd5298d) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250422.0  | 1.20250424.0  |
  | @cloudflare/workers-types | ^4.20250422.0 | ^4.20250424.0 |

- [#8860](https://github.com/cloudflare/workers-sdk/pull/8860) [`0838f1b`](https://github.com/cloudflare/workers-sdk/commit/0838f1b4ccce347921f3a0746652fe379dd16faf) Thanks [@teresalves](https://github.com/teresalves)! - KV: update error messages for 400 errors

## 4.20250422.0

### Minor Changes

- [#8640](https://github.com/cloudflare/workers-sdk/pull/8640) [`5ce70bd`](https://github.com/cloudflare/workers-sdk/commit/5ce70bdba8dc7e265447c997dc7c3af92469072b) Thanks [@kentonv](https://github.com/kentonv)! - Add support for defining `props` on a Service binding.

  In your configuration file, you can define a service binding with props:

  ```json
  {
  	"services": [
  		{
  			"binding": "MY_SERVICE",
  			"service": "some-worker",
  			"props": { "foo": 123, "bar": "value" }
  		}
  	]
  }
  ```

  These can then be accessed by the callee:

  ```ts
  import { WorkerEntrypoint } from "cloudflare:workers";

  export default class extends WorkerEntrypoint {
  	fetch() {
  		return new Response(JSON.stringify(this.ctx.props));
  	}
  }
  ```

### Patch Changes

- [#9030](https://github.com/cloudflare/workers-sdk/pull/9030) [`3f0adf3`](https://github.com/cloudflare/workers-sdk/commit/3f0adf3c25e9cede1bd8c2ae873c059d1ab2ef38) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250417.0  | 1.20250422.0  |
  | @cloudflare/workers-types | ^4.20250417.0 | ^4.20250422.0 |

## 4.20250417.0

### Minor Changes

- [#8935](https://github.com/cloudflare/workers-sdk/pull/8935) [`41f095b`](https://github.com/cloudflare/workers-sdk/commit/41f095b0dd35411adbca3398966b5cfe8c39d433) Thanks [@penalosa](https://github.com/penalosa)! - Internal refactor to move local analytics engine support from Wrangler to Miniflare

### Patch Changes

- [#8993](https://github.com/cloudflare/workers-sdk/pull/8993) [`2a7749b`](https://github.com/cloudflare/workers-sdk/commit/2a7749bffb7fe5550c3192401ed6edd72c0eb510) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250416.0  | 1.20250417.0  |
  | @cloudflare/workers-types | ^4.20250415.0 | ^4.20250417.0 |

## 4.20250416.0

### Patch Changes

- [#8927](https://github.com/cloudflare/workers-sdk/pull/8927) [`62c40d7`](https://github.com/cloudflare/workers-sdk/commit/62c40d792b9555e6e25a5f99ae803e4943c4b56f) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250410.0  | 1.20250416.0  |
  | @cloudflare/workers-types | ^4.20250410.0 | ^4.20250415.0 |

## 4.20250410.1

### Minor Changes

- [#8887](https://github.com/cloudflare/workers-sdk/pull/8887) [`511be3d`](https://github.com/cloudflare/workers-sdk/commit/511be3d17559e482fedf559cb61158e329c11d24) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add log message when `Sec-Fetch-Mode: navigate` is responsible for assets routing decision in `wrangler dev`

## 4.20250410.0

### Patch Changes

- [#8873](https://github.com/cloudflare/workers-sdk/pull/8873) [`f5413c5`](https://github.com/cloudflare/workers-sdk/commit/f5413c5269ab32522a70c3ebedba95bf6e7a4684) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250409.0  | 1.20250410.0  |
  | @cloudflare/workers-types | ^4.20250409.0 | ^4.20250410.0 |

## 4.20250409.0

### Patch Changes

- [#8859](https://github.com/cloudflare/workers-sdk/pull/8859) [`b7ac367`](https://github.com/cloudflare/workers-sdk/commit/b7ac367fe4c3d7a05525443cc30af10bc19ce014) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250408.0  | 1.20250409.0  |
  | @cloudflare/workers-types | ^4.20250408.0 | ^4.20250409.0 |

- [#8883](https://github.com/cloudflare/workers-sdk/pull/8883) [`5388447`](https://github.com/cloudflare/workers-sdk/commit/5388447d7ca5b00dbcc0970f52b76e20a17ebe30) Thanks [@penalosa](https://github.com/penalosa)! - fix: Only log requests to the Wrangler dev server once

## 4.20250408.0

### Patch Changes

- [#8810](https://github.com/cloudflare/workers-sdk/pull/8810) [`d454ad9`](https://github.com/cloudflare/workers-sdk/commit/d454ad99a75985744e7c48c93be098a96120e763) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250405.0  | 1.20250408.0  |
  | @cloudflare/workers-types | ^4.20250405.0 | ^4.20250408.0 |

## 4.20250405.1

### Minor Changes

- [#8375](https://github.com/cloudflare/workers-sdk/pull/8375) [`930ebb2`](https://github.com/cloudflare/workers-sdk/commit/930ebb279e165c1a82a70e89431e0a5a09b06647) Thanks [@penalosa](https://github.com/penalosa)! - Add support for email local dev and send_email binding

### Patch Changes

- [#8808](https://github.com/cloudflare/workers-sdk/pull/8808) [`afd93b9`](https://github.com/cloudflare/workers-sdk/commit/afd93b98d8eb700ce51dc8ea30eb0c0d56deae8d) Thanks [@teresalves](https://github.com/teresalves)! - KV: improve error messages for bulk gets

## 4.20250405.0

### Minor Changes

- [#8394](https://github.com/cloudflare/workers-sdk/pull/8394) [`93267cf`](https://github.com/cloudflare/workers-sdk/commit/93267cf3c59d57792fb10cc10b23255e33679c4d) Thanks [@edmundhung](https://github.com/edmundhung)! - Support Secrets Store Secret bindings

### Patch Changes

- [#8775](https://github.com/cloudflare/workers-sdk/pull/8775) [`ec7e621`](https://github.com/cloudflare/workers-sdk/commit/ec7e6212199272f9811a30a84922823c82d7d650) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250404.0  | 1.20250405.0  |
  | @cloudflare/workers-types | ^4.20250404.0 | ^4.20250405.0 |

## 4.20250404.0

### Patch Changes

- [#8712](https://github.com/cloudflare/workers-sdk/pull/8712) [`e0efb6f`](https://github.com/cloudflare/workers-sdk/commit/e0efb6f17e0c76aa504711b6ca25c025ee1d21e5) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250321.0  | 1.20250404.0  |
  | @cloudflare/workers-types | ^4.20250321.0 | ^4.20250404.0 |

- [#8747](https://github.com/cloudflare/workers-sdk/pull/8747) [`0a401d0`](https://github.com/cloudflare/workers-sdk/commit/0a401d07714dc4e383060a0bbf71843c13d13281) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure that `miniflare#setOptions` allows the update of inspector ports

## 4.20250321.2

### Patch Changes

- [#8449](https://github.com/cloudflare/workers-sdk/pull/8449) [`007f322`](https://github.com/cloudflare/workers-sdk/commit/007f322f66dc1edc70840330166732d25dae9cb3) Thanks [@harryzcy](https://github.com/harryzcy)! - update youch dependency to avoid vulnerable version of cookie

## 4.20250321.1

### Minor Changes

- [#8623](https://github.com/cloudflare/workers-sdk/pull/8623) [`cad99dc`](https://github.com/cloudflare/workers-sdk/commit/cad99dc78d76e35f846e85ac328effff8ba9477d) Thanks [@teresalves](https://github.com/teresalves)! - Add Miniflare Workers KV bulk get support

### Patch Changes

- [#8666](https://github.com/cloudflare/workers-sdk/pull/8666) [`f29f018`](https://github.com/cloudflare/workers-sdk/commit/f29f01813683ab3e42c53738be3d49a0f8cba512) Thanks [@penalosa](https://github.com/penalosa)! - Remove `NodeJSCompatModule`. This was never fully supported, and never worked for deploying Workers from Wrangler.

## 4.20250321.0

### Patch Changes

- [#8655](https://github.com/cloudflare/workers-sdk/pull/8655) [`7682675`](https://github.com/cloudflare/workers-sdk/commit/768267567427cb54f39dc13860b09affd924267d) Thanks [@emily-shen](https://github.com/emily-shen)! - fix bug where assets in directories starting with . would crash the dev server

- [#8650](https://github.com/cloudflare/workers-sdk/pull/8650) [`9c844f7`](https://github.com/cloudflare/workers-sdk/commit/9c844f771a5345e3ccf64f07ac1d476a50a80fb6) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250320.0  | 1.20250321.0  |
  | @cloudflare/workers-types | ^4.20250320.0 | ^4.20250321.0 |

## 4.20250320.0

### Patch Changes

- [#8618](https://github.com/cloudflare/workers-sdk/pull/8618) [`d8f1c49`](https://github.com/cloudflare/workers-sdk/commit/d8f1c49541229f4b41bd16bbebda3017a5d17d64) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250319.0  | 1.20250320.0  |
  | @cloudflare/workers-types | ^4.20250319.0 | ^4.20250320.0 |

- [#8556](https://github.com/cloudflare/workers-sdk/pull/8556) [`b7d6b7d`](https://github.com/cloudflare/workers-sdk/commit/b7d6b7dd1fbbaecd4f595d2d4249ab902b726538) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Add support for `assets_navigation_prefer_asset_serving` in Vite (`dev` and `preview`)

- [#8597](https://github.com/cloudflare/workers-sdk/pull/8597) [`5d78760`](https://github.com/cloudflare/workers-sdk/commit/5d78760af7adbb57416d73f102123152d37bec53) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Graduate experimental RPC support for Workers with assets in local dev

- [#8594](https://github.com/cloudflare/workers-sdk/pull/8594) [`c0d0cd0`](https://github.com/cloudflare/workers-sdk/commit/c0d0cd03a5eede7ec4f8a615f2c4b1f9a73dfcee) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Add support for property accessors in local dev RPC for Workers with assets

## 4.20250319.0

### Minor Changes

- [#8258](https://github.com/cloudflare/workers-sdk/pull/8258) [`9adbd50`](https://github.com/cloudflare/workers-sdk/commit/9adbd50cf1cbe841f8885de1d1d22b084fcfd987) Thanks [@knickish](https://github.com/knickish)! - Enable the creation of MySQL Hypedrive configs via the Wrangler CLI.

### Patch Changes

- [#8591](https://github.com/cloudflare/workers-sdk/pull/8591) [`dae7bd4`](https://github.com/cloudflare/workers-sdk/commit/dae7bd4dd0b97956d868799e6a01fe8b47a7250a) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250317.0  | 1.20250319.0  |
  | @cloudflare/workers-types | ^4.20250317.0 | ^4.20250319.0 |

- [#8376](https://github.com/cloudflare/workers-sdk/pull/8376) [`a25f060`](https://github.com/cloudflare/workers-sdk/commit/a25f060232bfbfb30aede6a891b665f0450770bf) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Make local dev RPC behaviour on par with production for Workers with assets

## 4.20250317.1

### Patch Changes

- [#8357](https://github.com/cloudflare/workers-sdk/pull/8357) [`ff26dc2`](https://github.com/cloudflare/workers-sdk/commit/ff26dc20210c193b9e175f5567277d5584bdf657) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feat: add new `unsafeInspectorProxy` option to miniflare

  Add a new `unsafeInspectorProxy` option to the miniflare worker options, if
  at least one worker has the option set then miniflare will establish a proxy
  between itself and workerd for the v8 inspector APIs which exposes only the
  requested workers to inspector clients. The inspector proxy communicates through
  miniflare's `inspectorPort` and exposes each requested worker via a path comprised
  of the worker's name

  example:

  ```js
  import { Miniflare } from "miniflare";

  const mf = new Miniflare({
  	// the inspector proxy will be accessible through port 9229
  	inspectorPort: 9229,
  	workers: [
  		{
  			name: "worker-a",
  			scriptPath: "./worker-a.js",
  			// enable the inspector proxy for worker-a
  			unsafeInspectorProxy: true,
  		},
  		{
  			name: "worker-b",
  			scriptPath: "./worker-b.js",
  			// worker-b is not going to be proxied
  		},
  		{
  			name: "worker-c",
  			scriptPath: "./worker-c.js",
  			// enable the inspector proxy for worker-c
  			unsafeInspectorProxy: true,
  		},
  	],
  });
  ```

  In the above example an inspector proxy gets set up which exposes `worker-a` and `worker-b`,
  inspector clients can discover such workers via `http://localhost:9229` and communicate with
  them respectively via `ws://localhost:9229/worker-a` and `ws://localhost:9229/worker-b`

  Note: this API is experimental, thus it's not being added to the public documentation and
  it's prefixed by `unsafe`

## 4.20250317.0

### Minor Changes

- [#8445](https://github.com/cloudflare/workers-sdk/pull/8445) [`74b0c73`](https://github.com/cloudflare/workers-sdk/commit/74b0c7377a643241d4e3efa674cd644f8f5b8e10) Thanks [@lambrospetrou](https://github.com/lambrospetrou)! - D1 local developer experience supports sessions API bookmarks

### Patch Changes

- [#8538](https://github.com/cloudflare/workers-sdk/pull/8538) [`5ae180e`](https://github.com/cloudflare/workers-sdk/commit/5ae180ee8acfc03b46bc3e836f5ce3856c458af8) Thanks [@emily-shen](https://github.com/emily-shen)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250310.0  | 1.20250317.0  |
  | @cloudflare/workers-types | ^4.20250310.0 | ^4.20250317.0 |

## 4.20250310.0

### Major Changes

- [#7334](https://github.com/cloudflare/workers-sdk/pull/7334) [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f) Thanks [@penalosa](https://github.com/penalosa)! - The `--node-compat` flag and `node_compat` config properties are no longer supported as of Wrangler v4. Instead, use the `nodejs_compat` compatibility flag. This includes the functionality from legacy `node_compat` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.

  If you need to replicate the behaviour of the legacy `node_compat` feature, refer to https://developers.cloudflare.com/workers/wrangler/migration/update-v3-to-v4/ for a detailed guide.

- [#7334](https://github.com/cloudflare/workers-sdk/pull/7334) [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f) Thanks [@penalosa](https://github.com/penalosa)! - Packages in Workers SDK now support the versions of Node that Node itself supports (Current, Active, Maintenance). Currently, that includes Node v18, v20, and v22.

## 3.20250310.0

### Patch Changes

- [#8423](https://github.com/cloudflare/workers-sdk/pull/8423) [`8242e07`](https://github.com/cloudflare/workers-sdk/commit/8242e07447f47ab764655e8ec9a046b1fe9ea279) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250224.0  | 1.20250310.0  |
  | @cloudflare/workers-types | ^4.20250224.0 | ^4.20250310.0 |

- [#8390](https://github.com/cloudflare/workers-sdk/pull/8390) [`53e6323`](https://github.com/cloudflare/workers-sdk/commit/53e63233c5b9bb786af3daea63c10ffe60a5d881) Thanks [@GregBrimble](https://github.com/GregBrimble)! - Parse and apply metafiles (`_headers` and `_redirects`) in `wrangler dev` for Workers Assets

## 3.20250224.0

### Patch Changes

- [#8338](https://github.com/cloudflare/workers-sdk/pull/8338) [`2d40989`](https://github.com/cloudflare/workers-sdk/commit/2d409892f1cf08f07f84d25dcab023bc20ada374) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Upload \_headers and \_redirects if present with Workers Assets as part of `wrangler deploy` and `wrangler versions upload`.

- [#8251](https://github.com/cloudflare/workers-sdk/pull/8251) [`da568e5`](https://github.com/cloudflare/workers-sdk/commit/da568e5a94bf270cfdcd80123d8161fc5437dcd2) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250214.0  | 1.20250224.0  |
  | @cloudflare/workers-types | ^4.20250214.0 | ^4.20250224.0 |

- [#8288](https://github.com/cloudflare/workers-sdk/pull/8288) [`cf14e17`](https://github.com/cloudflare/workers-sdk/commit/cf14e17d40b9e51475ba4d9ee6b4e3ef5ae5e841) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Add assets Proxy Worker skeleton in miniflare

  This commit implements a very basic Proxy Worker skeleton, and wires it in the "pipeline" miniflare creates for assets. This Worker will be incrementally worked on, but for now, the current implementation will forward all incoming requests to the Router Worker, thus leaving the current assets behaviour in local dev, the same.

  This is an experimental feature available under the `--x-assets-rpc` flag: `wrangler dev --x-assets-rpc`.

- [#8355](https://github.com/cloudflare/workers-sdk/pull/8355) [`79c7810`](https://github.com/cloudflare/workers-sdk/commit/79c781076cc79e512753b65644c027138aa1d878) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Add default empty router config for assets in Miniflare

## 3.20250214.2

### Patch Changes

- [#8274](https://github.com/cloudflare/workers-sdk/pull/8274) [`fce642d`](https://github.com/cloudflare/workers-sdk/commit/fce642d59264b1b6e7df8a6c9a015519b7574637) Thanks [@emily-shen](https://github.com/emily-shen)! - fix bindings to entrypoints on the same worker in workers with assets

- [#8289](https://github.com/cloudflare/workers-sdk/pull/8289) [`a4909cb`](https://github.com/cloudflare/workers-sdk/commit/a4909cbe552eae72b901cd78bf1f814f818085a0) Thanks [@penalosa](https://github.com/penalosa)! - Add the experimental `--x-assets-rpc` flag to gate feature work to support JSRPC with Workers + Assets projects.

## 3.20250214.1

### Patch Changes

- [#8247](https://github.com/cloudflare/workers-sdk/pull/8247) [`a9a4c33`](https://github.com/cloudflare/workers-sdk/commit/a9a4c33143b9f58673ac0cdd251957997275fa10) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feat: Omits Content-Type header for files of an unknown extension in Workers Assets

- [#8239](https://github.com/cloudflare/workers-sdk/pull/8239) [`6cae13a`](https://github.com/cloudflare/workers-sdk/commit/6cae13aa5f338cee18ec2e43a5dadda0c7d8dc2e) Thanks [@edmundhung](https://github.com/edmundhung)! - fix: allow the `fetchMock` option to be parsed upfront before passing it to Miniflare

## 3.20250214.0

### Patch Changes

- [#8171](https://github.com/cloudflare/workers-sdk/pull/8171) [`5e06177`](https://github.com/cloudflare/workers-sdk/commit/5e06177861b29aa9b114f9ecb50093190af94f4b) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250204.0  | 1.20250214.0  |
  | @cloudflare/workers-types | ^4.20250204.0 | ^4.20250214.0 |

## 3.20250204.1

### Patch Changes

- [#7950](https://github.com/cloudflare/workers-sdk/pull/7950) [`4db1fb5`](https://github.com/cloudflare/workers-sdk/commit/4db1fb5696412c6666589a778184e10386294d71) Thanks [@cmackenzie1](https://github.com/cmackenzie1)! - Add local binding support for Worker Pipelines

## 3.20250204.0

### Patch Changes

- [#8032](https://github.com/cloudflare/workers-sdk/pull/8032) [`c80dbd8`](https://github.com/cloudflare/workers-sdk/commit/c80dbd8d5e53a081cf600e250f1ddda860be1a12) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250129.0  | 1.20250204.0  |
  | @cloudflare/workers-types | ^4.20250129.0 | ^4.20250204.0 |

- [#7290](https://github.com/cloudflare/workers-sdk/pull/7290) [`0c0374c`](https://github.com/cloudflare/workers-sdk/commit/0c0374cce3908a47f7459ba4810855c1ce124349) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: add support for workers with assets when running multiple workers in one `wrangler dev` instance

  https://github.com/cloudflare/workers-sdk/pull/7251 added support for running multiple Workers in one `wrangler dev`/miniflare session. e.g. `wrangler dev -c wrangler.toml -c ../worker2/wrangler.toml`, which among other things, allowed cross-service RPC to Durable Objects.

  However this did not work in the same way as production when there was a Worker with assets - this PR should fix that.

## 3.20250129.0

### Patch Changes

- [#7971](https://github.com/cloudflare/workers-sdk/pull/7971) [`ab49886`](https://github.com/cloudflare/workers-sdk/commit/ab498862b96551774f601403d3e93d2105a18a91) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20250124.0  | 1.20250129.0  |
  | @cloudflare/workers-types | ^4.20250121.0 | ^4.20250129.0 |

## 3.20250124.1

### Patch Changes

- [#7788](https://github.com/cloudflare/workers-sdk/pull/7788) [`cf4f47a`](https://github.com/cloudflare/workers-sdk/commit/cf4f47a8af2dc476f8a0e61f0d22f080f191de1f) Thanks [@penalosa](https://github.com/penalosa)! - Switch to `capnp-es` over `capnp-ts`

## 3.20250124.0

### Patch Changes

- [#7890](https://github.com/cloudflare/workers-sdk/pull/7890) [`40f89a9`](https://github.com/cloudflare/workers-sdk/commit/40f89a90d93f57294e49a6b5ed8ba8cc38e0da77) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241230.0  | 1.20250124.0  |
  | @cloudflare/workers-types | ^4.20241230.0 | ^4.20250121.0 |

## 3.20241230.2

### Patch Changes

- [#7738](https://github.com/cloudflare/workers-sdk/pull/7738) [`8e9aa40`](https://github.com/cloudflare/workers-sdk/commit/8e9aa40a6c914a3a9804dccdca7202aecda45ba7) Thanks [@penalosa](https://github.com/penalosa)! - Use TEXT bindings for plain text values in Miniflare. This is an internal detail that should have no user facing impact.

## 3.20241230.1

### Minor Changes

- [#7702](https://github.com/cloudflare/workers-sdk/pull/7702) [`78bdec5`](https://github.com/cloudflare/workers-sdk/commit/78bdec59ce880365b0318eb94d4176b53e950f66) Thanks [@penalosa](https://github.com/penalosa)! - Support the `CF-Connecting-IP` header, which will be available in your Worker to determine the IP address of the client that initiated a request.

### Patch Changes

- [#7701](https://github.com/cloudflare/workers-sdk/pull/7701) [`2c76887`](https://github.com/cloudflare/workers-sdk/commit/2c7688737346992d046d2f88eba5c9847ede1365) Thanks [@lambrospetrou](https://github.com/lambrospetrou)! - Fix D1 exports to properly pad HEX strings for binary values.

## 3.20241230.0

### Patch Changes

- [#7652](https://github.com/cloudflare/workers-sdk/pull/7652) [`b4e0af1`](https://github.com/cloudflare/workers-sdk/commit/b4e0af163548ee8cc0aefc9165f67a0f83ea94d4) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241218.0  | 1.20241230.0  |
  | @cloudflare/workers-types | ^4.20241218.0 | ^4.20241230.0 |

## 3.20241218.0

### Patch Changes

- [#7589](https://github.com/cloudflare/workers-sdk/pull/7589) [`1488e11`](https://github.com/cloudflare/workers-sdk/commit/1488e118b4a43d032e4f2e69afa1c16c2e54aff6) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241205.0  | 1.20241218.0  |
  | @cloudflare/workers-types | ^4.20241205.0 | ^4.20241218.0 |

- [#7575](https://github.com/cloudflare/workers-sdk/pull/7575) [`7216835`](https://github.com/cloudflare/workers-sdk/commit/7216835bf7489804905751c6b52e75a8945e7974) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Make `Instance.status()` return type the same as production

## 3.20241205.0

### Patch Changes

- [#7464](https://github.com/cloudflare/workers-sdk/pull/7464) [`21a9e24`](https://github.com/cloudflare/workers-sdk/commit/21a9e24bc7cea1e7bf54a77568de98df9b7c8d03) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241106.2  | 1.20241205.0  |
  | @cloudflare/workers-types | ^4.20241106.0 | ^4.20241205.0 |

## 3.20241106.2

### Patch Changes

- [#7418](https://github.com/cloudflare/workers-sdk/pull/7418) [`ac87395`](https://github.com/cloudflare/workers-sdk/commit/ac873952cfca41c67ce7855a73c6d3a8b131be06) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241106.1  | 1.20241106.2  |
  | @cloudflare/workers-types | ^4.20241106.0 | ^4.20241106.0 |

- [#7399](https://github.com/cloudflare/workers-sdk/pull/7399) [`b3d2e7d`](https://github.com/cloudflare/workers-sdk/commit/b3d2e7dcee4358322f751b54a7b77d47f7b5ca78) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: update queues max_batch_timeout limit from 30s to 60s

## 3.20241106.1

### Minor Changes

- [#7286](https://github.com/cloudflare/workers-sdk/pull/7286) [`563439b`](https://github.com/cloudflare/workers-sdk/commit/563439bd02c450921b28d721d36be5a70897690d) Thanks [@LuisDuarte1](https://github.com/LuisDuarte1)! - Add proper engine persistance in .wrangler and fix multiple workflows in miniflare

## 3.20241106.0

### Patch Changes

- [#7187](https://github.com/cloudflare/workers-sdk/pull/7187) [`1db7846`](https://github.com/cloudflare/workers-sdk/commit/1db7846ec5c356f6b59cddf5f48b16b3e7c73d66) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241022.0  | 1.20241106.1  |
  | @cloudflare/workers-types | ^4.20241022.0 | ^4.20241106.0 |

## 3.20241022.0

### Patch Changes

- [#7066](https://github.com/cloudflare/workers-sdk/pull/7066) [`760e43f`](https://github.com/cloudflare/workers-sdk/commit/760e43ffa197597de5625b96bc91376161f5027a) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241018.1  | 1.20241022.0  |
  | @cloudflare/workers-types | ^4.20241018.0 | ^4.20241022.0 |

- [#7045](https://github.com/cloudflare/workers-sdk/pull/7045) [`5ef6231`](https://github.com/cloudflare/workers-sdk/commit/5ef6231a5cefbaaef123e6e8ee899fb81fc69e3e) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Add preliminary support for Workflows in wrangler dev

## 3.20241018.0

### Patch Changes

- [#7035](https://github.com/cloudflare/workers-sdk/pull/7035) [`809193e`](https://github.com/cloudflare/workers-sdk/commit/809193e05ad80c32086acf18646d0bd436cf2bfd) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241011.1  | 1.20241018.1  |
  | @cloudflare/workers-types | ^4.20241011.0 | ^4.20241018.0 |

## 3.20241011.0

### Patch Changes

- [#6961](https://github.com/cloudflare/workers-sdk/pull/6961) [`5761020`](https://github.com/cloudflare/workers-sdk/commit/5761020cb41270ce872ad6c555b263597949c06d) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20241004.0  | 1.20241011.1  |
  | @cloudflare/workers-types | ^4.20241004.0 | ^4.20241011.0 |

- [#6943](https://github.com/cloudflare/workers-sdk/pull/6943) [`7859a04`](https://github.com/cloudflare/workers-sdk/commit/7859a04bcd4b2f1cafe67c371bd236acaf7a2d91) Thanks [@sdnts](https://github.com/sdnts)! - fix: local queues now respect consumer max delays and retry delays properly

## 3.20241004.0

### Patch Changes

- [#6949](https://github.com/cloudflare/workers-sdk/pull/6949) [`c863183`](https://github.com/cloudflare/workers-sdk/commit/c86318354f1a6c0f5c096d6b2a884de740552a19) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240925.0  | 1.20241004.0  |
  | @cloudflare/workers-types | ^4.20240925.0 | ^4.20241004.0 |

## 3.20240925.1

### Patch Changes

- [#6835](https://github.com/cloudflare/workers-sdk/pull/6835) [`5c50949`](https://github.com/cloudflare/workers-sdk/commit/5c509494807a1c0418be83c47a459ec80126848e) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: rename asset plugin options slightly to match wrangler.toml better

  Renamed `path` -> `directory`, `bindingName` -> `binding`.

## 3.20240925.0

### Patch Changes

- [#6826](https://github.com/cloudflare/workers-sdk/pull/6826) [`5e2e62c`](https://github.com/cloudflare/workers-sdk/commit/5e2e62c165166819c63998ad0c7caaaf57d7b988) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240909.0  | 1.20240925.0  |
  | @cloudflare/workers-types | ^4.20240909.0 | ^4.20240925.0 |

- [#6824](https://github.com/cloudflare/workers-sdk/pull/6824) [`1c58a74`](https://github.com/cloudflare/workers-sdk/commit/1c58a7470757508e64003d05c76d9deb7f223763) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: teach Miniflare about node_compat version date switch

  A compatibility of Sept 23, 2024 or later means that `nodejs_compat` is equivalent to `nodejs_compat_v2`.

## 3.20240909.5

### Patch Changes

- [#6728](https://github.com/cloudflare/workers-sdk/pull/6728) [`1ca313f`](https://github.com/cloudflare/workers-sdk/commit/1ca313f2041688cd13e25f0817e3b72dfc930bac) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: remove filepath encoding on asset upload and handle sometimes-encoded characters

  Some characters like [ ] @ are encoded by encodeURIComponent() but are often requested at an unencoded URL path.
  This change will make assets with filenames with these characters accessible at both the encoded and unencoded paths,
  but to use the encoded path as the canonical one, and to redirect requests to the canonical path if necessary.

## 3.20240909.4

### Patch Changes

- [#6736](https://github.com/cloudflare/workers-sdk/pull/6736) [`2ddbb65`](https://github.com/cloudflare/workers-sdk/commit/2ddbb65033e88dfc2127a093fc894ac91bd96369) Thanks [@emily-shen](https://github.com/emily-shen)! - fix: reflect file changes when using dev with workers + assets

## 3.20240909.3

### Patch Changes

- [#6514](https://github.com/cloudflare/workers-sdk/pull/6514) [`2407c41`](https://github.com/cloudflare/workers-sdk/commit/2407c41484f29845a64ccffd9368bc5d234eb831) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Fix Miniflare regression introduced in #5570

  PR #5570 introduced a regression in Miniflare, namely that declaring Queue Producers like `queueProducers: { "MY_QUEUE": "my-queue" }` no longer works. This commit fixes the issue.

  Fixes #5908

## 3.20240909.2

### Patch Changes

- [#6719](https://github.com/cloudflare/workers-sdk/pull/6719) [`5b5dd95`](https://github.com/cloudflare/workers-sdk/commit/5b5dd9573b2c43023cbcba0fbcc3e374465e745e) Thanks [@sdnts](https://github.com/sdnts)! - fix: Respect delivery delays for Queue consumers in local dev mode

## 3.20240909.1

### Minor Changes

- [#6647](https://github.com/cloudflare/workers-sdk/pull/6647) [`d68e8c9`](https://github.com/cloudflare/workers-sdk/commit/d68e8c996ba40eaaf4a3b237f89880bdaafd0113) Thanks [@joshthoward](https://github.com/joshthoward)! - feat: Configure SQLite backed Durable Objects in local dev

## 3.20240909.0

### Patch Changes

- [#6673](https://github.com/cloudflare/workers-sdk/pull/6673) [`3f5b934`](https://github.com/cloudflare/workers-sdk/commit/3f5b9343a46dedcb80c8e216eb3ca9d7f687f6cf) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240821.1  | 1.20240909.0  |
  | @cloudflare/workers-types | ^4.20240821.1 | ^4.20240909.0 |

## 3.20240821.2

### Patch Changes

- [#6627](https://github.com/cloudflare/workers-sdk/pull/6627) [`5936282`](https://github.com/cloudflare/workers-sdk/commit/5936282bfbda848b465396a70f6334988d1a57a0) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: Fixes max asset count error message to properly report count of assets

- [#6612](https://github.com/cloudflare/workers-sdk/pull/6612) [`6471090`](https://github.com/cloudflare/workers-sdk/commit/64710904ad4055054bea09ebb23ededab140aa79) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: add hyperdrive bindings support in `getBindings`

  Note: the returned binding values are no-op/passthrough that can be used inside node.js, meaning
  that besides direct connections via the `connect` methods, all the other values point to the
  same db connection specified in the user configuration

## 3.20240821.1

### Patch Changes

- [#6564](https://github.com/cloudflare/workers-sdk/pull/6564) [`e8975a9`](https://github.com/cloudflare/workers-sdk/commit/e8975a93a46d41ea270f63fd9ef40677ccc689c3) Thanks [@emily-shen](https://github.com/emily-shen)! - feat: add assets plugin to miniflare

  New miniflare plugin for Workers + Assets, with relevant services imported from `workers-shared`.

## 3.20240821.0

### Patch Changes

- [#6555](https://github.com/cloudflare/workers-sdk/pull/6555) [`b0e2f0b`](https://github.com/cloudflare/workers-sdk/commit/b0e2f0bfc67bee9c43a64ca12447e778758c27cd) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240806.0  | 1.20240821.1  |
  | @cloudflare/workers-types | ^4.20240806.0 | ^4.20240821.1 |

## 3.20240806.1

### Minor Changes

- [#6403](https://github.com/cloudflare/workers-sdk/pull/6403) [`00f340f`](https://github.com/cloudflare/workers-sdk/commit/00f340f7c1709db777e80a8ea24d245909ff4486) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - feat: Extend KV plugin behaviour to support Workers assets

  This commit extends Miniflare's KV plugin's behaviour to support Workers assets, and therefore enables the emulation of Workers with assets in local development.

## 3.20240806.0

### Patch Changes

- [#6438](https://github.com/cloudflare/workers-sdk/pull/6438) [`d55eeca`](https://github.com/cloudflare/workers-sdk/commit/d55eeca878b68bd10ddcc5ef3b1b4d820b037684) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240725.0  | 1.20240806.0  |
  | @cloudflare/workers-types | ^4.20240725.0 | ^4.20240806.0 |

## 3.20240725.0

### Patch Changes

- [#6345](https://github.com/cloudflare/workers-sdk/pull/6345) [`a9021aa`](https://github.com/cloudflare/workers-sdk/commit/a9021aa520541e6a83e572d01e57e232cbc163e0) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240718.0  | 1.20240725.0  |
  | @cloudflare/workers-types | ^4.20240718.0 | ^4.20240725.0 |

- [#6301](https://github.com/cloudflare/workers-sdk/pull/6301) [`44ad2c7`](https://github.com/cloudflare/workers-sdk/commit/44ad2c777bd254dbb62cf7f8b1c2f8351c74fb75) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: Allow the magic proxy to proxy objects containing functions indexed by symbols

  In https://github.com/cloudflare/workers-sdk/pull/5670 we introduced the possibility
  of the magic proxy to handle object containing functions, the implementation didn't
  account for functions being indexed by symbols, address such issue

## 3.20240718.1

### Patch Changes

- [#6342](https://github.com/cloudflare/workers-sdk/pull/6342) [`b3c3cb8`](https://github.com/cloudflare/workers-sdk/commit/b3c3cb89787b8f669485c1c54f9d73ea9ec53605) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix Miniflare (workerd) network settings to allow 240.0.0.0 range

## 3.20240718.0

### Patch Changes

- [#6294](https://github.com/cloudflare/workers-sdk/pull/6294) [`779c713`](https://github.com/cloudflare/workers-sdk/commit/779c71349ea1c747ff4486e4084024a7e88a05cb) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240712.0  | 1.20240718.0  |
  | @cloudflare/workers-types | ^4.20240712.0 | ^4.20240718.0 |

## 3.20240712.0

### Patch Changes

- [#6265](https://github.com/cloudflare/workers-sdk/pull/6265) [`0d32448`](https://github.com/cloudflare/workers-sdk/commit/0d32448fc72521be691dfc87c8ad5f108ddced62) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240701.0  | 1.20240712.0  |
  | @cloudflare/workers-types | ^4.20240620.0 | ^4.20240712.0 |

## 3.20240701.0

### Minor Changes

- [#6073](https://github.com/cloudflare/workers-sdk/pull/6073) [`7ed675e`](https://github.com/cloudflare/workers-sdk/commit/7ed675e3a43cfd996496bf1be2b31d34bde36664) Thanks [@geelen](https://github.com/geelen)! - Added D1 export support for local databases

### Patch Changes

- [#6181](https://github.com/cloudflare/workers-sdk/pull/6181) [`42a7930`](https://github.com/cloudflare/workers-sdk/commit/42a7930c6d81610c14005503c078610f28b9bc33) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency | From         | To           |
  | ---------- | ------------ | ------------ |
  | workerd    | 1.20240620.1 | 1.20240701.0 |

- [#6127](https://github.com/cloudflare/workers-sdk/pull/6127) [`1568c25`](https://github.com/cloudflare/workers-sdk/commit/1568c251112e06feb1d3d1df844eaa660bb9fbe8) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - fix: Bump ws dependency

## 3.20240620.0

### Patch Changes

- [#6110](https://github.com/cloudflare/workers-sdk/pull/6110) [`7d02856`](https://github.com/cloudflare/workers-sdk/commit/7d02856ae2cbd90eb94324f9f6fcb44cd2c44059) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240610.1  | 1.20240620.1  |
  | @cloudflare/workers-types | ^4.20240605.0 | ^4.20240620.0 |

## 3.20240610.1

### Patch Changes

- [#6050](https://github.com/cloudflare/workers-sdk/pull/6050) [`a0c3327`](https://github.com/cloudflare/workers-sdk/commit/a0c3327dd63059d3e24085a95f48f8a98605c49f) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize more deps

  This is the last of the patches that normalize dependencies across the codebase. In this batch: `ws`, `vitest`, `zod` , `rimraf`, `@types/rimraf`, `ava`, `source-map`, `glob`, `cookie`, `@types/cookie`, `@microsoft/api-extractor`, `@types/mime`, `@types/yargs`, `devtools-protocol`, `@vitest/ui`, `execa`, `strip-ansi`

  This patch also sorts dependencies in every `package.json`

- [#6029](https://github.com/cloudflare/workers-sdk/pull/6029) [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize some dependencies in workers-sdk

  This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).

- [#6058](https://github.com/cloudflare/workers-sdk/pull/6058) [`31cd51f`](https://github.com/cloudflare/workers-sdk/commit/31cd51f251050b0d6db97857a8d1d5427c855d99) Thanks [@threepointone](https://github.com/threepointone)! - chore: Quieter builds

  This patch cleans up warnings we were seeing when doing a full build. Specifically:

  - fixtures/remix-pages-app had a bunch of warnings about impending features that it should be upgraded to, so I did that. (tbh this one needs a full upgrade of packages, but we'll get to that later when we're upgrading across the codebase)
  - updated `@microsoft/api-extractor` so it didn't complain that it didn't match the `typescript` version (that we'd recently upgraded)
  - it also silenced a bunch of warnings when exporting types from `wrangler`. We'll need to fix those, but we'll do that when we work on unstable_dev etc.
  - workers-playground was complaining about the size of the bundle being generated, so I increased the limit on it

## 3.20240610.0

### Patch Changes

- [#6024](https://github.com/cloudflare/workers-sdk/pull/6024) [`c4146fc`](https://github.com/cloudflare/workers-sdk/commit/c4146fc021cbb0556cc95899184b7a44d58ad77c) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency | From         | To           |
  | ---------- | ------------ | ------------ |
  | workerd    | 1.20240605.0 | 1.20240610.1 |

## 3.20240605.0

### Patch Changes

- [#5961](https://github.com/cloudflare/workers-sdk/pull/5961) [`ab95473`](https://github.com/cloudflare/workers-sdk/commit/ab9547380fd6fbc1d20c8dd4211faedbe94e5b33) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240524.0  | 1.20240605.0  |
  | @cloudflare/workers-types | ^4.20240524.0 | ^4.20240605.0 |

## 3.20240524.2

### Patch Changes

- [#5922](https://github.com/cloudflare/workers-sdk/pull/5922) [`bdbb7f8`](https://github.com/cloudflare/workers-sdk/commit/bdbb7f890d3fa5b6fa7ac79a3bb650ece9417fb2) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: Allow the magic proxy to handle functions returning functions

  Previously functions returning functions would not be handled by the magic proxy,
  the changes here enable the above, allowing for code such as the following:

  ```js
  	const mf = new Miniflare(/* ... */);

  	const { functionsFactory } = await mf.getBindings<Env>();
  	const fn = functionsFactory.getFunction();
  	const functionResult = fn();
  ```

  This also works with the native workers RPC mechanism, allowing users to
  return functions in their RPC code.

## 3.20240524.1

### Patch Changes

- [#5921](https://github.com/cloudflare/workers-sdk/pull/5921) [`e0e7725`](https://github.com/cloudflare/workers-sdk/commit/e0e772575c079787f56615ec3d7a6a4af0633b5a) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - docs: add configuration section with local workerd linking to main readme

## 3.20240524.0

### Minor Changes

- [#5917](https://github.com/cloudflare/workers-sdk/pull/5917) [`64ccdd6`](https://github.com/cloudflare/workers-sdk/commit/64ccdd6a6777c5fd85116af0d660cb3ee2e1de4d) Thanks [@kossnocorp](https://github.com/kossnocorp)! - fix: D1's JOIN behaviour when selecting columns with the same name.

  Properly handle the `resultsFormat` query that `workerd` sends. This partially fixes [the JOIN bug](https://github.com/cloudflare/workers-sdk/issues/3160) and makes the behaviour of `raw` consistent with the `workerd` behaviour.

### Patch Changes

- [#5931](https://github.com/cloudflare/workers-sdk/pull/5931) [`4458a9e`](https://github.com/cloudflare/workers-sdk/commit/4458a9ea1a2b7748d6066557f48f68ec430d383b) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240512.0  | 1.20240524.0  |
  | @cloudflare/workers-types | ^4.20240512.0 | ^4.20240524.0 |

## 3.20240512.0

### Patch Changes

- [#5827](https://github.com/cloudflare/workers-sdk/pull/5827) [`0725f6f`](https://github.com/cloudflare/workers-sdk/commit/0725f6f73199daf7f11eec9830bc4d1f66c05d62) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240419.0  | 1.20240512.0  |
  | @cloudflare/workers-types | ^4.20240419.0 | ^4.20240512.0 |

- [#5798](https://github.com/cloudflare/workers-sdk/pull/5798) [`89b6d7f`](https://github.com/cloudflare/workers-sdk/commit/89b6d7f3832b350b470a981eb3b4388517612363) Thanks [@RamIdeas](https://github.com/RamIdeas)! - fix: update miniflare's response compression to act more like Cloudflare platform

## 3.20240419.1

### Minor Changes

- [#5570](https://github.com/cloudflare/workers-sdk/pull/5570) [`66bdad0`](https://github.com/cloudflare/workers-sdk/commit/66bdad08834b403100d1e4d6cd507978cc50eaba) Thanks [@sesteves](https://github.com/sesteves)! - feature: support delayed delivery in the miniflare's queue simulator.

  This change updates the miniflare's queue broker to support delayed delivery of messages, both when sending the message from a producer and when retrying the message from a consumer.

### Patch Changes

- [#5670](https://github.com/cloudflare/workers-sdk/pull/5670) [`9b4af8a`](https://github.com/cloudflare/workers-sdk/commit/9b4af8a59bc75ed494dd752c0a7007dbacf75e51) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: Allow the magic proxy to proxy objects containing functions

  This was previously prevented but this change removes that restriction.

## 3.20240419.0

### Patch Changes

- [#5682](https://github.com/cloudflare/workers-sdk/pull/5682) [`3a0d735`](https://github.com/cloudflare/workers-sdk/commit/3a0d7356bd8bc6fe614a3ef3f9c1278659555568) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240405.0  | 1.20240419.0  |
  | @cloudflare/workers-types | ^4.20240405.0 | ^4.20240419.0 |

- [#5482](https://github.com/cloudflare/workers-sdk/pull/5482) [`1b7739e`](https://github.com/cloudflare/workers-sdk/commit/1b7739e0af99860aa063f01c0a6e7712ac072fdb) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - docs: show new Discord url everywhere for consistency. The old URL still works, but https://discord.cloudflare.com is preferred.

## 3.20240405.2

### Patch Changes

- [#5599](https://github.com/cloudflare/workers-sdk/pull/5599) [`c9f081a`](https://github.com/cloudflare/workers-sdk/commit/c9f081ab72142060a3cf2e9a7ef4546b8014b210) Thanks [@penalosa](https://github.com/penalosa)! - fix: add support for wrapped bindings in magic proxy

  currently `Miniflare#getBindings()` does not return proxies to provided `wrappedBindings`, make sure that appropriate proxies are instead returned

  Example:

  ```ts
  import { Miniflare } from "miniflare";

  const mf = new Miniflare({
  	workers: [
  		{
  			wrappedBindings: {
  				Greeter: {
  					scriptName: "impl",
  				},
  			},
  			modules: true,
  			script: `export default { fetch(){ return new Response(''); } }`,
  		},
  		{
  			modules: true,
  			name: "impl",
  			script: `
  				class Greeter {
  					sayHello(name) {
  						return "Hello " + name;
  					}
  				}
  
  				export default function (env) {
  					return new Greeter();
  				}
  			`,
  		},
  	],
  });

  const { Greeter } = await mf.getBindings();

  console.log(Greeter.sayHello("world")); // <--- prints 'Hello world'

  await mf.dispose();
  ```

- [#5599](https://github.com/cloudflare/workers-sdk/pull/5599) [`c9f081a`](https://github.com/cloudflare/workers-sdk/commit/c9f081ab72142060a3cf2e9a7ef4546b8014b210) Thanks [@penalosa](https://github.com/penalosa)! - fix: add support for RPC in magic proxy

  currently `Miniflare#getBindings()` does not return valid proxies to provided `serviceBindings` using RPC, make sure that appropriate proxies are instead returned

  Example:

  ```ts
  import { Miniflare } from "miniflare";

  const mf = new Miniflare({
  	workers: [
  		{
  			modules: true,
  			script: `export default { fetch() { return new Response(''); } }`,
  			serviceBindings: {
  				SUM: {
  					name: "sum-worker",
  					entrypoint: "SumEntrypoint",
  				},
  			},
  		},
  		{
  			modules: true,
  			name: "sum-worker",
  			script: `
  				import { WorkerEntrypoint } from 'cloudflare:workers';
  
  				export default { fetch() { return new Response(''); } }
  
  				export class SumEntrypoint extends WorkerEntrypoint {
  					sum(args) {
  						return args.reduce((a, b) => a + b);
  					}
  				}
  			`,
  		},
  	],
  });

  const { SUM } = await mf.getBindings();

  const numbers = [1, 2, 3];

  console.log(`The sum of ${numbers.join(", ")} is ${await SUM.sum(numbers)}`); // <--- prints 'The sum of 1, 2, 3 is 6'

  await mf.dispose();
  ```

## 3.20240405.1

### Minor Changes

- [#5409](https://github.com/cloudflare/workers-sdk/pull/5409) [`08b4908`](https://github.com/cloudflare/workers-sdk/commit/08b490806093add445ff3d7b1969923cb4123d34) Thanks [@mrbbot](https://github.com/mrbbot)! - feature: respect incoming `Accept-Encoding` header and ensure `Accept-Encoding`/`request.cf.clientAcceptEncoding` set correctly

  Previously, Miniflare would pass through the incoming `Accept-Encoding` header to your Worker code. This change ensures this header is always set to `Accept-Encoding: br, gzip` for incoming requests to your Worker. The original value of `Accept-Encoding` will be stored in `request.cf.clientAcceptEncoding`. This matches [deployed behaviour](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#accept-encoding).

  Fixes #5246

## 3.20240405.0

### Patch Changes

- [#5554](https://github.com/cloudflare/workers-sdk/pull/5554) [`9575a51`](https://github.com/cloudflare/workers-sdk/commit/9575a514cbc206fea6d08f627253ead209fd2a8d) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240404.0  | 1.20240405.0  |
  | @cloudflare/workers-types | ^4.20240404.0 | ^4.20240405.0 |

## 3.20240404.0

### Patch Changes

- [#5520](https://github.com/cloudflare/workers-sdk/pull/5520) [`9f15ce1`](https://github.com/cloudflare/workers-sdk/commit/9f15ce1716c50dd44adf7a3df6a4101322800005) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240403.0  | 1.20240404.0  |
  | @cloudflare/workers-types | ^4.20240329.0 | ^4.20240404.0 |

## 3.20240403.0

### Minor Changes

- [#5215](https://github.com/cloudflare/workers-sdk/pull/5215) [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feature: customisable unsafe direct sockets entrypoints

  Previously, Miniflare provided experimental `unsafeDirectHost` and `unsafeDirectPort` options for starting an HTTP server that pointed directly to a specific Worker. This change replaces these options with a single `unsafeDirectSockets` option that accepts an array of socket objects of the form `{ host?: string, port?: number, entrypoint?: string, proxy?: boolean }`. `host` defaults to `127.0.0.1`, `port` defaults to `0`, `entrypoint` defaults to `default`, and `proxy` defaults to `false`. This allows you to start HTTP servers for specific entrypoints of specific Workers. `proxy` controls the [`Style`](https://github.com/cloudflare/workerd/blob/af35f1e7b0f166ec4ca93a8bf7daeacda029f11d/src/workerd/server/workerd.capnp#L780-L789) of the socket.

  Note these sockets set the `capnpConnectHost` `workerd` option to `"miniflare-unsafe-internal-capnp-connect"`. `external` `serviceBindings` will set their `capnpConnectHost` option to the same value allowing RPC over multiple `Miniflare` instances. Refer to https://github.com/cloudflare/workerd/pull/1757 for more information.

- [#5215](https://github.com/cloudflare/workers-sdk/pull/5215) [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327) Thanks [@GregBrimble](https://github.com/GregBrimble)! - feature: support named entrypoints for `serviceBindings`

  This change allows service bindings to bind to a named export of another Worker using designators of the form `{ name: string | typeof kCurrentWorker, entrypoint?: string }`. Previously, you could only bind to the `default` entrypoint. With this change, you can bind to any exported entrypoint.

  ```ts
  import { kCurrentWorker, Miniflare } from "miniflare";

  const mf = new Miniflare({
  	workers: [
  		{
  			name: "a",
  			serviceBindings: {
  				A_RPC_SERVICE: { name: kCurrentWorker, entrypoint: "RpcEntrypoint" },
  				A_NAMED_SERVICE: { name: "a", entrypoint: "namedEntrypoint" },
  				B_NAMED_SERVICE: { name: "b", entrypoint: "anotherNamedEntrypoint" },
  			},
  			compatibilityFlags: ["rpc"],
  			modules: true,
  			script: `
  			import { WorkerEntrypoint } from "cloudflare:workers";
  
  			export class RpcEntrypoint extends WorkerEntrypoint {
  				ping() { return "a:rpc:pong"; }
  			}
  
  			export const namedEntrypoint = {
  				fetch(request, env, ctx) { return new Response("a:named:pong"); }
  			};
  
  			...
  			`,
  		},
  		{
  			name: "b",
  			modules: true,
  			script: `
  			export const anotherNamedEntrypoint = {
  				fetch(request, env, ctx) { return new Response("b:named:pong"); }
  			};
  			`,
  		},
  	],
  });
  ```

### Patch Changes

- [#5499](https://github.com/cloudflare/workers-sdk/pull/5499) [`6c3be5b`](https://github.com/cloudflare/workers-sdk/commit/6c3be5b299b22cad050760a6015106839b5cc74e) Thanks [@GregBrimble](https://github.com/GregBrimble)! - chore: Bump workerd@1.20240403.0

- [#5215](https://github.com/cloudflare/workers-sdk/pull/5215) [`cd03d1d`](https://github.com/cloudflare/workers-sdk/commit/cd03d1d3fa6e733faa42e5abb92f37637503b327) Thanks [@GregBrimble](https://github.com/GregBrimble)! - fix: allow `script`s without `scriptPath`s to import built-in modules

  Previously, if a string `script` option was specified with `modules: true` but without a corresponding `scriptPath`, all `import`s were forbidden. This change relaxes that restriction to allow imports of built-in `node:*`, `cloudflare:*` and `workerd:*` modules without a `scriptPath`.

## 3.20240329.1

### Patch Changes

- [#5491](https://github.com/cloudflare/workers-sdk/pull/5491) [`940ad89`](https://github.com/cloudflare/workers-sdk/commit/940ad89713fa086f23d394570c328716bfb1bd59) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - fix: make sure the magic proxy can handle multiple parallel r2 stream reads

  Currently trying to read multiple R2 streams in parallel (via `Promise.all` for example) leads to deadlock which prevents any of the target streams from being read. This is caused by the underlying implementation only allowing a single HTTP connection to the Workers runtime at a time. This change fixes the issue by allowing multiple parallel HTTP connections.

## 3.20240329.0

### Minor Changes

- [#5455](https://github.com/cloudflare/workers-sdk/pull/5455) [`d994066`](https://github.com/cloudflare/workers-sdk/commit/d994066f255f6851759a055eac3b52a4aa4b83c3) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `workerd` to [`1.20240329.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20240329.0)

## 3.20240320.1

### Minor Changes

- [#5258](https://github.com/cloudflare/workers-sdk/pull/5258) [`fbdca7d`](https://github.com/cloudflare/workers-sdk/commit/fbdca7d93156f9db2a1513573e45f10fac7e57d1) Thanks [@OilyLime](https://github.com/OilyLime)! - feature: URL decode components of the Hyperdrive config connection string

## 3.20240320.0

### Patch Changes

- [#5341](https://github.com/cloudflare/workers-sdk/pull/5341) [`248a318`](https://github.com/cloudflare/workers-sdk/commit/248a318acac293615327affe35b83018a48dddc9) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore: update dependencies of "miniflare" package

  The following dependency versions have been updated:

  | Dependency                | From          | To            |
  | ------------------------- | ------------- | ------------- |
  | workerd                   | 1.20240314.0  | 1.20240320.1  |
  | @cloudflare/workers-types | ^4.20240314.0 | ^4.20240320.1 |

## 3.20240314.0

### Minor Changes

- [#5240](https://github.com/cloudflare/workers-sdk/pull/5240) [`1720f0a`](https://github.com/cloudflare/workers-sdk/commit/1720f0a12a6376093b3c5799d74f47c522ae8571) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - chore: bump `workerd` to [`1.20240314.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20240314.0)

## 3.20240304.2

### Patch Changes

- [#5247](https://github.com/cloudflare/workers-sdk/pull/5247) [`2e50d51`](https://github.com/cloudflare/workers-sdk/commit/2e50d51632dfe905bd32de8176231bb256c88dab) Thanks [@CarmenPopoviciu](https://github.com/CarmenPopoviciu)! - fix: Add internal APIs to support the Workers Vitest integration

## 3.20240304.1

### Patch Changes

- [#5201](https://github.com/cloudflare/workers-sdk/pull/5201) [`1235d48`](https://github.com/cloudflare/workers-sdk/commit/1235d48fed9f4e348011fd62fce6458006947501) Thanks [@wydengyre](https://github.com/wydengyre)! - fix: ensure `miniflare` works with Node 21.7.0+

- [#5191](https://github.com/cloudflare/workers-sdk/pull/5191) [`27fb22b`](https://github.com/cloudflare/workers-sdk/commit/27fb22b7c6b224aecc852915d9fee600d9d86efc) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure redirect responses handled correctly with `dispatchFetch()`

  Previously, if your Worker returned a redirect response, calling `dispatchFetch(url)` would send another request to the original `url` rather than the redirect. This change ensures redirects are followed correctly.

  - If your Worker returns a relative redirect or an absolute redirect with the same origin as the original `url`, the request will be sent to the Worker.
  - If your Worker instead returns an absolute redirect with a different origin, the request will be sent to the Internet.
  - If a redirected request to a different origin returns an absolute redirect with the same origin as the original `url`, the request will also be sent to the Worker.

## 3.20240304.0

### Minor Changes

- [#5148](https://github.com/cloudflare/workers-sdk/pull/5148) [`11951f3`](https://github.com/cloudflare/workers-sdk/commit/11951f344ccac340be5d059bc4dd28ef674fb36f) Thanks [@dom96](https://github.com/dom96)! - chore: bump `workerd` to [`1.20240304.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20240304.0)

- [#5148](https://github.com/cloudflare/workers-sdk/pull/5148) [`11951f3`](https://github.com/cloudflare/workers-sdk/commit/11951f344ccac340be5d059bc4dd28ef674fb36f) Thanks [@dom96](https://github.com/dom96)! - fix: use python_workers compat flag for Python

## 3.20240223.1

### Patch Changes

- [#5133](https://github.com/cloudflare/workers-sdk/pull/5133) [`42bcc72`](https://github.com/cloudflare/workers-sdk/commit/42bcc7216ab14455c1398d55bc552023726eb423) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure internals can access `workerd` when starting on non-local `host`

  Previously, if Miniflare was configured to start on a `host` that wasn't `127.0.0.1`, `::1`, `*`, `::`, or `0.0.0.0`, calls to `Miniflare` API methods relying on the magic proxy (e.g. `getKVNamespace()`, `getWorker()`, etc.) would fail. This change ensures `workerd` is always accessible to Miniflare's internals. This also fixes `wrangler dev` when using local network address such as `192.168.0.10` with the `--ip` flag.

- [#5133](https://github.com/cloudflare/workers-sdk/pull/5133) [`42bcc72`](https://github.com/cloudflare/workers-sdk/commit/42bcc7216ab14455c1398d55bc552023726eb423) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure IPv6 addresses can be used as `host`s

  Previously, if Miniflare was configured to start on an IPv6 `host`, it could crash. This change ensures IPv6 addresses are handled correctly. This also fixes `wrangler dev` when using IPv6 addresses such as `::1` with the `--ip` flag.

## 3.20240223.0

### Minor Changes

- [#5081](https://github.com/cloudflare/workers-sdk/pull/5081) [`0c0949d`](https://github.com/cloudflare/workers-sdk/commit/0c0949da60e3287c05a5884bb9f869ce5609a9a1) Thanks [@garrettgu10](https://github.com/garrettgu10)! - chore: bump `workerd` to [`1.20240223.1`](https://github.com/cloudflare/workerd/releases/tag/v1.20240223.0)

## 3.20240208.0

### Minor Changes

- [#5068](https://github.com/cloudflare/workers-sdk/pull/5068) [`b03db864`](https://github.com/cloudflare/workers-sdk/commit/b03db864a36924c31b8ddd82a027c83df4f68c43) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `workerd` to [`1.20240208.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20240208.0)

## 3.20240129.3

### Minor Changes

- [#4795](https://github.com/cloudflare/workers-sdk/pull/4795) [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: pass `Miniflare` instance as argument to custom service binding handlers

  This change adds a new `Miniflare`-typed parameter to function-valued service binding handlers. This provides easy access to the correct bindings when re-using service functions across instances.

  <!--prettier-ignore-start-->

  ```js
  import assert from "node:assert";
  import { Miniflare, Response } from "miniflare";

  const mf = new Miniflare({
  	serviceBindings: {
  		SERVICE(request, instance) {
  			assert(instance === mf);
  			return new Response();
  		},
  	},
  });
  ```

  <!--prettier-ignore-end-->

* [#4795](https://github.com/cloudflare/workers-sdk/pull/4795) [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: allow `URL`s to be passed in `hyperdrives`

  Previously, the `hyperdrives` option only accepted `string`s as connection strings. This change allows `URL` objects to be passed too.

- [#4795](https://github.com/cloudflare/workers-sdk/pull/4795) [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: add support for custom root paths

  Miniflare has lots of file-path-valued options (e.g. `scriptPath`, `kvPersist`, `textBlobBindings`). Previously, these were always resolved relative to the current working directory before being used. This change adds a new `rootPath` shared, and per-worker option for customising this behaviour. Instead of resolving relative to the current working directory, Miniflare will now resolve path-valued options relative to the closest `rootPath` option. Paths are still resolved relative to the current working directory if no `rootPath`s are defined. Worker-level `rootPath`s are themselves resolved relative to the shared `rootPath` if defined.

  <!--prettier-ignore-start-->

  ```js
  import { Miniflare } from "miniflare";

  const mf1 = new Miniflare({
  	scriptPath: "index.mjs",
  });

  const mf2 = new Miniflare({
  	rootPath: "a/b",
  	scriptPath: "c/index.mjs",
  });

  const mf3 = new Miniflare({
  	rootPath: "/a/b",
  	workers: [
  		{
  			name: "1",
  			rootPath: "c",
  			scriptPath: "index.mjs",
  		},
  		{
  			name: "2",
  			scriptPath: "index.mjs",
  		},
  	],
  });
  ```

  <!--prettier-ignore-end-->

* [#4795](https://github.com/cloudflare/workers-sdk/pull/4795) [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: allow easy binding to current worker

  Previously, if you wanted to create a service binding to the current Worker, you'd need to know the Worker's name. This is usually possible, but can get tricky when dealing with many Workers. This change adds a new `kCurrentWorker` symbol that can be used instead of a Worker name in `serviceBindings`. `kCurrentWorker` always points to the Worker with the binding.

  <!--prettier-ignore-start-->

  ```js
  import { kCurrentWorker, Miniflare } from "miniflare";

  const mf = new Miniflare({
  	serviceBindings: {
  		SELF: kCurrentWorker,
  	},
  	modules: true,
  	script: `export default {
      fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);
        if (pathname === "/recurse") {
          return env.SELF.fetch("http://placeholder");
        }
        return new Response("body");
      }
    }`,
  });

  const response = await mf.dispatchFetch("http://placeholder/recurse");
  console.log(await response.text()); // body
  ```

  <!--prettier-ignore-end-->

### Patch Changes

- [#4954](https://github.com/cloudflare/workers-sdk/pull/4954) [`7723ac17`](https://github.com/cloudflare/workers-sdk/commit/7723ac17906f894afe9af2152437726ac09a6290) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: allow relative `scriptPath`/`modulesRoot`s to break out of current working directory

  Previously, Miniflare would resolve relative `scriptPath`s against `moduleRoot` multiple times resulting in incorrect paths and module names. This would lead to `can't use ".." to break out of starting directory` `workerd` errors. This change ensures Miniflare uses `scriptPath` as is, and only resolves it relative to `modulesRoot` when computing module names. Note this bug didn't affect service workers. This allows you to reference a modules `scriptPath` outside the working directory with something like:

  ```js
  const mf = new Miniflare({
  	modules: true,
  	modulesRoot: "..",
  	scriptPath: "../worker.mjs",
  });
  ```

  Fixes #4721

* [#4795](https://github.com/cloudflare/workers-sdk/pull/4795) [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: return non-WebSocket responses for failed WebSocket upgrading `fetch()`es

  Previously, Miniflare's `fetch()` would throw an error if the `Upgrade: websocket` header was set, and a non-WebSocket response was returned from the origin. This change ensures the non-WebSocket response is returned from `fetch()` instead, with `webSocket` set to `null`. This allows the caller to handle the response as they see fit.

- [#4795](https://github.com/cloudflare/workers-sdk/pull/4795) [`027f9719`](https://github.com/cloudflare/workers-sdk/commit/027f971975a48a564603275f3583d21e9d053229) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `MiniflareOptions`, `WorkerOptions`, and `SharedOptions` types are correct

  Miniflare uses Zod for validating options. Previously, Miniflare inferred `*Options` from the _output_ types of its Zod schemas, rather than the _input_ types. In most cases, these were the same. However, the `hyperdrives` option has different input/output types, preventing these from being type checked correctly.

## 3.20240129.2

### Patch Changes

- [#4950](https://github.com/cloudflare/workers-sdk/pull/4950) [`05360e43`](https://github.com/cloudflare/workers-sdk/commit/05360e432bff922def960e86690232c762fad284) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure we do not rewrite external Origin headers in wrangler dev

  In https://github.com/cloudflare/workers-sdk/pull/4812 we tried to fix the Origin headers to match the Host header but were overzealous and rewrote Origin headers for external origins (outside of the proxy server's origin).

  This is now fixed, and moreover we rewrite any headers that refer to the proxy server on the request with the configured host and vice versa on the response.

  This should ensure that CORS is not broken in browsers when a different host is being simulated based on routes in the Wrangler configuration.

## 3.20240129.1

### Minor Changes

- [#4905](https://github.com/cloudflare/workers-sdk/pull/4905) [`148feff6`](https://github.com/cloudflare/workers-sdk/commit/148feff60c9bf3886c0e0fd1ea98049955c27659) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - feature: add a `getCf` method to Miniflare instances

  add a new `getCf` method attached to instances of `Miniflare`, this `getCf` returns
  the `cf` object that the Miniflare instance provides to the actual workers and it
  depends of the core option of the same name

  Example:

  ```ts
  import { Miniflare } from "miniflare";

  const mf = new Miniflare({ ... });

  const cf = await mf.getCf();

  console.log(`country = ${cf.country} ; colo = ${cf.colo}`); // logs 'country = GB ; colo = LHR'
  ```

## 3.20240129.0

### Minor Changes

- [#4873](https://github.com/cloudflare/workers-sdk/pull/4873) [`1e424ff2`](https://github.com/cloudflare/workers-sdk/commit/1e424ff280610657e997df8290d0b39b0393c845) Thanks [@dom96](https://github.com/dom96)! - feature: implemented basic Python support

  Here is an example showing how to construct a MiniFlare instance with a Python module:

  ```js
  const mf = new Miniflare({
  	modules: [
  		{
  			type: "PythonModule",
  			path: "index",
  			contents:
  				"from js import Response;\ndef fetch(request):\n  return Response.new('hello')",
  		},
  	],
  	compatibilityFlags: ["experimental"],
  });
  ```

### Patch Changes

- [#4874](https://github.com/cloudflare/workers-sdk/pull/4874) [`749fa3c0`](https://github.com/cloudflare/workers-sdk/commit/749fa3c05e6b9fcaa59a72f60f7936b7beaed5ad) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `workerd` to [`1.20240129.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20240129.0)

## 3.20231218.4

### Patch Changes

- [#4812](https://github.com/cloudflare/workers-sdk/pull/4812) [`8166eefc`](https://github.com/cloudflare/workers-sdk/commit/8166eefc11ff3b5ce6ede41fe9d6224d945a2cde) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure that Origin header is rewritten as necessary

  The `wrangler dev` command puts the Worker under test behind a proxy server.
  This proxy server should be transparent to the client and the Worker, which
  means that the `Request` arriving at the Worker with the correct `url` property,
  and `Host` and `Origin` headers.
  Previously we fixed the `Host` header but missed the `Origin` header which is
  only added to a request under certain circumstances, such as cross-origin requests.

  This change fixes the `Origin` header as well, so that it is rewritten, when it exists,
  to use the `origin` of the `url` property.

  Fixes #4761

## 3.20231218.3

### Patch Changes

- [#4768](https://github.com/cloudflare/workers-sdk/pull/4768) [`c3e410c2`](https://github.com/cloudflare/workers-sdk/commit/c3e410c2797f5c59b9ea0f63c20feef643366df2) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - ci: bump undici versions to 5.28.2

## 3.20231218.2

### Minor Changes

- [#4686](https://github.com/cloudflare/workers-sdk/pull/4686) [`4f6999ea`](https://github.com/cloudflare/workers-sdk/commit/4f6999eacd591d0d65180f805f2abc3c8a2c06c4) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: expose `rows_read` and `rows_written` in D1 result `meta`

  `rows_read`/`rows_written` contain the number of rows read from/written to the database engine when executing a query respectively. These numbers may be greater than the number of rows returned from/inserted by a query. These numbers form billing metrics when your Worker is deployed. See https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics for more details.

### Patch Changes

- [#4719](https://github.com/cloudflare/workers-sdk/pull/4719) [`c37d94b5`](https://github.com/cloudflare/workers-sdk/commit/c37d94b51f4d5517c244f8a4178be6a266d2362e) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `miniflare` and `wrangler` can source map in the same process

  Previously, if in a `wrangler dev` session you called `console.log()` and threw an unhandled error you'd see an error like `[ERR_ASSERTION]: The expression evaluated to a falsy value`. This change ensures you can do both of these things in the same session.

## 3.20231218.1

### Patch Changes

- [#4630](https://github.com/cloudflare/workers-sdk/pull/4630) [`037de5ec`](https://github.com/cloudflare/workers-sdk/commit/037de5ec77efc8261860c6d625bc90cd1f2fdd41) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure User Worker gets the correct Host header in wrangler dev local mode

  Some full-stack frameworks, such as Next.js, check that the Host header for a server
  side action request matches the host where the application is expected to run.

  In `wrangler dev` we have a Proxy Worker in between the browser and the actual User Worker.
  This Proxy Worker is forwarding on the request from the browser, but then the actual User
  Worker is running on a different host:port combination than that which the browser thinks
  it should be on. This was causing the framework to think the request is malicious and blocking
  it.

  Now we update the request's Host header to that passed from the Proxy Worker in a custom `MF-Original-Url`
  header, but only do this if the request also contains a shared secret between the Proxy Worker
  and User Worker, which is passed via the `MF-Proxy-Shared-Secret` header. This last feature is to
  prevent a malicious website from faking the Host header in a request directly to the User Worker.

  Fixes https://github.com/cloudflare/next-on-pages/issues/588

## 3.20231218.0

### Minor Changes

- [#4684](https://github.com/cloudflare/workers-sdk/pull/4684) [`c410ea14`](https://github.com/cloudflare/workers-sdk/commit/c410ea141f02f808ff3dddfa9ee21ccbb530acec) Thanks [@mrbbot](https://github.com/mrbbot)! - chore: bump `workerd` to [`1.20231218.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20231218.0)

## 3.20231030.4

### Patch Changes

- [#4448](https://github.com/cloudflare/workers-sdk/pull/4448) [`eb08e2dc`](https://github.com/cloudflare/workers-sdk/commit/eb08e2dc3c0f09d16883f85201fbeb892e6f5a5b) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: include request url and headers in pretty error page

  This change ensures Miniflare's pretty error page includes the URL and headers of the incoming request, rather than Miniflare's internal request for the page.

## 3.20231030.3

### Patch Changes

- [#4466](https://github.com/cloudflare/workers-sdk/pull/4466) [`71fb0b86`](https://github.com/cloudflare/workers-sdk/commit/71fb0b86cf0ed81cc29ad71792edbba3a79ba87c) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure unused KV and Cache blobs cleaned up

  When storing data in KV, Cache and R2, Miniflare uses both an SQL database and separate blob store. When writing a key/value pair, a blob is created for the new value and the old blob for the previous value (if any) is deleted. A few months ago, we introduced a change that prevented old blobs being deleted for KV and Cache. R2 was unaffected. This shouldn't have caused any problems, but could lead to persistence directories growing unnecessarily as they filled up with garbage blobs. This change ensures garbage blobs are deleted.

  Note existing garbage will not be cleaned up. If you'd like to do this, download this Node script (https://gist.github.com/mrbbot/68787e19dcde511bd99aa94997b39076). If you're using the default Wrangler persistence directory, run `node gc.mjs kv .wrangler/state/v3/kv <namespace_id_1> <namespace_id_2> ...` and `node gc.mjs cache .wrangler/state/v3/cache default named:<cache_name_1> named:<cache_name_2> ...` with each of your KV namespace IDs (not binding names) and named caches.

* [#4550](https://github.com/cloudflare/workers-sdk/pull/4550) [`63708a94`](https://github.com/cloudflare/workers-sdk/commit/63708a94fb7a055bf15fa963f2d598b47b11d3c0) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: validate `Host` and `Orgin` headers where appropriate

  `Host` and `Origin` headers are now checked when connecting to the inspector and Miniflare's magic proxy. If these don't match what's expected, the request will fail.

## 3.20231030.2

### Patch Changes

- [#4505](https://github.com/cloudflare/workers-sdk/pull/4505) [`1b348782`](https://github.com/cloudflare/workers-sdk/commit/1b34878287e3c98e8743e0a9c30b860107d4fcbe) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: remove `__STATIC_CONTENT_MANIFEST` from module worker `env`

  When using Workers Sites with a module worker, the asset manifest must be imported from the `__STATIC_CONTENT_MANIFEST` virtual module. Miniflare provided this module, but also erroneously added `__STATIC_CONTENT_MANIFEST` to the `env` object too. Whilst this didn't break anything locally, it could cause users to develop Workers that ran locally, but not when deployed. This change ensures `env` doesn't contain `__STATIC_CONTENT_MANIFEST`.

## 3.20231030.1

### Minor Changes

- [#4348](https://github.com/cloudflare/workers-sdk/pull/4348) [`be2b9cf5`](https://github.com/cloudflare/workers-sdk/commit/be2b9cf5a9395cf7385f59d2e1ec3131dae3d87f) Thanks [@mrbbot](https://github.com/mrbbot)! - feat: add support for wrapped bindings

  This change adds a new `wrappedBindings` worker option for configuring
  `workerd`'s [wrapped bindings](https://github.com/cloudflare/workerd/blob/bfcef2d850514c569c039cb84c43bc046af4ffb9/src/workerd/server/workerd.capnp#L469-L487).
  These allow custom bindings to be written as JavaScript functions accepting an
  `env` parameter of "inner bindings" and returning the value to bind. For more
  details, refer to the [API docs](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/README.md#core).

* [#4341](https://github.com/cloudflare/workers-sdk/pull/4341) [`d9908743`](https://github.com/cloudflare/workers-sdk/commit/d99087433814e4f1fb98cd61b03b6e2f606b1a15) Thanks [@RamIdeas](https://github.com/RamIdeas)! - Added a `handleRuntimeStdio` which enables wrangler (or any other direct use of Miniflare) to handle the `stdout` and `stderr` streams from the workerd child process. By default, if this option is not provided, the previous behaviour is retained which splits the streams into lines and calls `console.log`/`console.error`.

## 3.20231030.0

### Minor Changes

- [#4324](https://github.com/cloudflare/workers-sdk/pull/4324) [`16cc2e92`](https://github.com/cloudflare/workers-sdk/commit/16cc2e923733b3c583b5bf6c40384c52fea04991) Thanks [@penalosa](https://github.com/penalosa)! - Update to [latest `workerd@1.20231030.0`](https://github.com/cloudflare/workerd/releases/tag/v1.20231030.0)

* [#4322](https://github.com/cloudflare/workers-sdk/pull/4322) [`8a25b7fb`](https://github.com/cloudflare/workers-sdk/commit/8a25b7fba94c8e9989412bc266ada307975f182d) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - add `unsafeEvalBinding` option

  Add option to leverage the newly introduced [`UnsafeEval`](https://github.com/cloudflare/workerd/pull/1338) workerd binding API,
  such API is used to evaluate javascript code at runtime via the provided `eval` and `newFunction` methods.

  The API, for security reasons (as per the [workers docs](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#javascript-standards)), is not to be use in production but it is intended for local purposes only such as local testing.

  To use the binding you need to specify a string value for the `unsafeEvalBinding`, such will be the name of the `UnsafeEval` bindings that will be made available in the workerd runtime.

  For example the following code shows how to set the binding with the `UNSAFE_EVAL` name and evaluate the `1+1` string:

  ```ts
  const mf = new Miniflare({
  	log,
  	modules: true,
  	script: `
        export default {
            fetch(req, env, ctx) {
                const two = env.UNSAFE_EVAL.eval('1+1');
                return new Response('two = ' + two); // returns 'two = 2'
            }
        }
    `,
  	unsafeEvalBinding: "UNSAFE_EVAL",
  });
  ```

### Patch Changes

- [#4397](https://github.com/cloudflare/workers-sdk/pull/4397) [`4f8b3420`](https://github.com/cloudflare/workers-sdk/commit/4f8b3420f93197d331491f012ff6f4626411bfc5) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: reject `Miniflare#ready` promise if `Miniflare#dispose()` called while waiting

* [#4428](https://github.com/cloudflare/workers-sdk/pull/4428) [`3637d97a`](https://github.com/cloudflare/workers-sdk/commit/3637d97a99c9d5e8d0d2b5f3adaf4bd9993265f0) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: add `miniflare` `bin` entry

  Miniflare 3 doesn't include a CLI anymore, but should log a useful error stating this when running `npx miniflare`. We had a script for this, but it wasn't correctly hooked up. :facepalm: This change makes sure the required `bin` entry exists.

- [#4321](https://github.com/cloudflare/workers-sdk/pull/4321) [`29a59d4e`](https://github.com/cloudflare/workers-sdk/commit/29a59d4e72e3ae849474325c5c93252a3f84af0d) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: ensure `Mutex` doesn't report itself as drained if locked

  Previously, Miniflare's `Mutex` implementation would report itself as drained
  if there were no waiters, regardless of the locked state. This bug meant that
  if you called but didn't `await` `Miniflare#setOptions()`, future calls to
  `Miniflare#dispatchFetch()` (or any other asynchronous `Miniflare` method)
  wouldn't wait for the options update to apply and the runtime to restart before
  sending requests. This change ensures we wait until the mutex is unlocked before
  reporting it as drained.

* [#4307](https://github.com/cloudflare/workers-sdk/pull/4307) [`7fbe1937`](https://github.com/cloudflare/workers-sdk/commit/7fbe1937b311f36077c92814207bbb15ef3878d6) Thanks [@jspspike](https://github.com/jspspike)! - Only output ipv4 addresses when starting

- [#4400](https://github.com/cloudflare/workers-sdk/pull/4400) [`76787861`](https://github.com/cloudflare/workers-sdk/commit/767878613eda535d125539a478d488d1a42feaa1) Thanks [@mrbbot](https://github.com/mrbbot)! - fix: cleanup temporary directory after shutting down `workerd`

  Previously on exit, Miniflare would attempt to remove its temporary directory
  before shutting down `workerd`. This could lead to `EBUSY` errors on Windows.
  This change ensures we shutdown `workerd` before removing the directory.
  Since we can only clean up on a best effort basis when exiting, it also catches
  any errors thrown when removing the directory, in case the runtime doesn't
  shutdown fast enough.

## Previous Releases

For previous Miniflare 3 releases, refer to this GitHub releases page: https://github.com/cloudflare/miniflare/releases.

For previous Miniflare 1 and 2 releases, refer to this `CHANGELOG`: https://github.com/cloudflare/miniflare/blob/master/docs/CHANGELOG.md
