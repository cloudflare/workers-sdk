# Changelog

## 0.4.2

### Patch Changes

- [#11898](https://github.com/cloudflare/workers-sdk/pull/11898) [`c17e971`](https://github.com/cloudflare/workers-sdk/commit/c17e971af01a9bcead0aca409666e29417f4636a) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Bundle more third-party dependencies to reduce supply chain risk

  Previously, several small utility packages were listed as runtime dependencies and
  installed separately. These are now bundled directly into the published packages,
  reducing the number of external dependencies users need to trust.

  Bundled dependencies:

  - **miniflare**: `acorn`, `acorn-walk`, `exit-hook`, `glob-to-regexp`, `stoppable`
  - **kv-asset-handler**: `mime`
  - **vite-plugin-cloudflare**: `@remix-run/node-fetch-server`, `defu`, `get-port`, `picocolors`, `tinyglobby`
  - **vitest-pool-workers**: `birpc`, `devalue`, `get-port`, `semver`

## 0.4.1

### Patch Changes

- [#11348](https://github.com/cloudflare/workers-sdk/pull/11348) [`4d61fae`](https://github.com/cloudflare/workers-sdk/commit/4d61faed1c0c5cb0f7a7f085d31c3dca9a83c802) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - refactor to generate ESM modules and support Node 22+

## 0.4.0

### Minor Changes

- [#7334](https://github.com/cloudflare/workers-sdk/pull/7334) [`869ec7b`](https://github.com/cloudflare/workers-sdk/commit/869ec7b916487ec43b958a27bdfea13588c5685f) Thanks [@penalosa](https://github.com/penalosa)! - Packages in Workers SDK now support the versions of Node that Node itself supports (Current, Active, Maintenance). Currently, that includes Node v18, v20, and v22.

## 0.3.4

### Patch Changes

- [#6102](https://github.com/cloudflare/workers-sdk/pull/6102) [`d4e1e9f`](https://github.com/cloudflare/workers-sdk/commit/d4e1e9fc3439c3d6bd2d1d145d3edc85b551f276) Thanks [@threepointone](https://github.com/threepointone)! - chore: pass lint/typechecks for kv-asset-handler

  Followup from https://github.com/cloudflare/workers-sdk/pull/6090, this enables typechecking and linting in kv-asset-handler, and fixes any failures.

## 0.3.3

### Patch Changes

- [#6029](https://github.com/cloudflare/workers-sdk/pull/6029) [`f5ad1d3`](https://github.com/cloudflare/workers-sdk/commit/f5ad1d3e562ce63b59f6ab136f1cdd703605bca4) Thanks [@threepointone](https://github.com/threepointone)! - chore: Normalize some dependencies in workers-sdk

  This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).

## 0.3.2

### Patch Changes

- [#5482](https://github.com/cloudflare/workers-sdk/pull/5482) [`1b7739e`](https://github.com/cloudflare/workers-sdk/commit/1b7739e0af99860aa063f01c0a6e7712ac072fdb) Thanks [@DaniFoldi](https://github.com/DaniFoldi)! - docs: show new Discord url everywhere for consistency. The old URL still works, but https://discord.cloudflare.com is preferred.

## 0.3.1

- ## Maintenance

  - **Remove tests from npm package to reduce npm package size - [boidolr], [pull/388]**

  This PR removes the tests from the npm package, reducing the size of the package by about half.

  [boidolr]: https://github.com/boidolr
  [pull/388]: https://github.com/cloudflare/kv-asset-handler/pull/388

  - **Bump dependencies - [Cherry], [pull/367] [pull/361] [pull/362] [pull/359] [pull/390]**

  These PRs bump dependencies of the project to their latest versions.

  [pull/367]: https://github.com/cloudflare/kv-asset-handler/pull/367
  [pull/361]: https://github.com/cloudflare/kv-asset-handler/pull/361
  [pull/362]: https://github.com/cloudflare/kv-asset-handler/pull/362
  [pull/359]: https://github.com/cloudflare/kv-asset-handler/pull/359
  [pull/390]: https://github.com/cloudflare/kv-asset-handler/pull/390

  - **Fix README anchor links - [johtso] [pull/372]**

  This PR fixes the anchor links in the README.

  [johtso]: https://github.com/johtso
  [pull/372]: https://github.com/cloudflare/kv-asset-handler/pull/372

## 0.3.0

- ### Features

  - **Allow configurable downgrade of ETag validator strength - [awwong1], [pull/315]**

  This allows users to override the default strong ETag validator behaviour to use weak ETag validators. This change allows the developer to use weak ETags and preserve 304 responses (e.g. on \*.workers.dev domains).

- ### Fixes

  - **Fix length property call on ArrayBuffer instance - [philipatkinson], [pull/295**]

  Previously when edge cached was enabled, the `content-length` of the response was not being set correctly. This was due to the `length` property of the `ArrayBuffer` instance being called instead of the `byteLength` property. This PR fixes this issue.

- ### Maintenance

  - **chore(ci): bump node versions in actions - [KianNH], [pull/354]**

    This bumps the Node versions used in the CI actions to the latest LTS versions.

  - **chore: use tabs for indentation - [Cherry], [pull/355]**

    This PR changes the indentation of the project to use tabs instead of spaces, falling more in line with other Cloudflare JavaScript projects like wrangler.

  - **chore: bump dependencies - [Cherry], [pull/356]**

    This bumps many dependencies of the project to their latest versions.

## 0.2.0

- ### Features

  - **Allow changing pathIsEncoded through options - [JackPriceBurns], [pull/243]**

    When using `mapRequestToAsset`, it encodes the URL / key and will never check the KV store for the decoded key.

    This adds the ability to set `pathIsEncoded` to true, which will decode the URL before getting it from the KV.

    [jackpriceburns]: https://github.com/JackPriceBurns
    [pull/243]: https://github.com/cloudflare/kv-asset-handler/pull/243

  - **Support ES Modules. - [threepointone], [pull/261]**

    This PR provides a possible solution for getting Workers Sites working with ES Module workers. This approach is not as invasive as other approaches, so isn't as risky either.

    Usage:

    ```jsx
    import manifestJSON from "__STATIC_CONTENT_MANIFEST";
    const manifest = JSON.parse(manifestJSON);

    export default {
      fetch(request, env, ctx) {
        return await getAssetFromKV(
          {
            request,
            waitUntil(promise) {
              return ctx.waitUntil(promise);
            },
          },
          {
            ASSET_NAMESPACE: env.ASSET_NAMESPACE,
            ASSET_MANIFEST: manifest,
          }
        );
        // ...
      },
    };
    ```

    [threepointone]: https://github.com/threepointone
    [pull/261]: https://github.com/cloudflare/kv-asset-handler/pull/261

- ### Fixes

  - **fix: default ASSET_MANIFEST to empty object - [Cherry], [pull/254]**

    As per [discussion in Discord](https://canary.discord.com/channels/595317990191398933/831143699999752262/898392183999197184) and the repo at [https://github.com/Erisa-bits/getassetfromkv-undefined-error], allowing `ASSET_MANIFEST` to be optional got lost somewhere along the years and errors when attempted to be used without it. This PR restores this functionality by setting it to an empty object (instead of `undefined`), which allows fall-through to the standard `mapRequestToAsset` function.

    chore: bump dependencies - This updates a few dependencies and also pins `@types/node` to `15.x` since `16.x` has some incompatible types.
    feat: generate more modern code - This removes the unnecessary async/await polyfill added by TypeScript

    [cherry]: https://github.com/Cherry
    [pull/254]: https://github.com/cloudflare/kv-asset-handler/pull/254

- ### Maintenance

  - **chore: remove debug logs around `response.body.cancel` support - [Cherry], [pull/249]**

    Fixes [issues/248]

    [cherry]: https://github.com/Cherry
    [pull/249]: https://github.com/cloudflare/kv-asset-handler/pull/249
    [issues/248]: https://github.com/cloudflare/kv-asset-handler/issue/248

## 0.1.3

- ### Performance

  - **Only parse `ASSET_MANIFEST` once on startup - [Cherry], [pull/185]**

    This PR improves performance of the `getAssetFromKV` function by only parsing the asset manifest once on startup, instead of on each request. This can have a significant improvement in response times for larger sites. An example of the performance improvement with an asset manifest of over 50k files:

    > Before change:
    > 100 iterations: Done. Mean kv response time is 16.61
    > 1000 iterations: Done. Mean kv response time is 17.798
    > After change:
    > 100 iterations: Done. Mean kv response time is 6.62
    > 1000 iterations: Done. Mean kv response time is 7.296

    Initial work and credit to [groenlid] in [pull/143].

    [cherry]: https://github.com/Cherry
    [groenlid]: https://github.com/groenlid
    [pull/185]: https://github.com/cloudflare/kv-asset-handler/pull/185
    [pull/143]: https://github.com/cloudflare/kv-asset-handler/pull/143

- ### Fixes

  - **ESM compatibility: fix crash on missing global environment variables - [ttraenkler], [pull/188]**

    This PR fixes the library from crashing when global environment variables such as `__STATIC_CONTENT` and `__STATIC_CONTENT_MANIFEST` are missing, which is currently the case when using the new ESM module syntax.

    Note that whilst this partially resolves the issue discussed in [issue/174], it does not provide full ESM compatibility yet. Please see [issue/174] for further discussion.

    [ttraenkler]: https://github.com/ttraenkler
    [pull/188]: https://github.com/cloudflare/kv-asset-handler/pull/188
    [issue/174]: https://github.com/cloudflare/kv-asset-handler/issues/174

- ### Maintenance

  - **Tweak GitHub Actions Workflow for proper PR testing - [Cherry], [pull/185]**

    This PR tweaks the GitHub Actions Workflow to test PRs properly, both in terms of linting and the repository tests. It runs `prettier` to maintain code quality and style, and all unit tests on every PR to ensure no regressions occur.

    [pull/183]: https://github.com/cloudflare/kv-asset-handler/pull/185
    [cherry]: https://github.com/Cherry

  - **Add test for `mapRequestToAsset` asset override - [Cherry], [pull/186]**

    This PR adds a test for the functionality added in [pull/159]. This tests that when overriding the `mapRequestToAsset` function in its entirety, this function is always run.

    [pull/159]: https://github.com/cloudflare/kv-asset-handler/pull/159
    [pull/186]: https://github.com/cloudflare/kv-asset-handler/pull/186
    [cherry]: https://github.com/Cherry

  - **Dependabot updates**

    A number of dependabot patch-level updates have been merged:

    - Bump @types/node from 15.3.1 to 15.6.0 ([pull/183])
    - Bump @types/node from 15.6.0 to 15.6.1 ([pull/184])
    - Bump @types/node from 15.6.1 to 15.9.0 ([pull/189])
    - Bump @types/node from 15.9.0 to 15.12.0 ([pull/190])
    - Bump @types/node from 15.12.0 to 15.12.1 ([pull/191])
    - Bump @types/node from 15.12.1 to 15.12.2 ([pull/193])
    - Bump typescript from 4.2.4 to 4.3.2 ([pull/187])
    - Bump prettier from 2.3.0 to 2.3.1 ([pull/192])

    [pull/183]: https://github.com/cloudflare/kv-asset-handler/pull/183
    [pull/184]: https://github.com/cloudflare/kv-asset-handler/pull/184
    [pull/189]: https://github.com/cloudflare/kv-asset-handler/pull/189
    [pull/190]: https://github.com/cloudflare/kv-asset-handler/pull/190
    [pull/191]: https://github.com/cloudflare/kv-asset-handler/pull/191
    [pull/193]: https://github.com/cloudflare/kv-asset-handler/pull/193
    [pull/187]: https://github.com/cloudflare/kv-asset-handler/pull/187
    [pull/192]: https://github.com/cloudflare/kv-asset-handler/pull/192

## 0.1.2

- ### Features

  - **Support for `defaultDocument` configuration - [boemekeld], [pull/161]**

    This PR adds support for customizing the `defaultDocument` option in `getAssetFromKV`. In situations where a project does not use `index.html` as the default document for a path, this can now be customized to values like `index.shtm`:

    ```js
    return getAssetFromKV(event, {
      defaultDocument: "index.shtm",
    });
    ```

    [boemekeld]: https://github.com/boemekeld
    [pull/161]: https://github.com/cloudflare/kv-asset-handler/pull/161

- ### Fixes

  - **Fire `mapRequestToAsset` for all requests, if explicitly defined - [Cherry], [pull/159]**

    This PR fixes an issue where a custom `mapRequestToAsset` handler weren't fired if a matching asset path was found in `ASSET_MANIFEST` data. By correctly checking for this handler, we can conditionally handle any assets with this handler _even_ if they exist in the `ASSET_MANIFEST`.

    **Note that this is a breaking change**, as previously, the mapRequestToAsset function was ignored if you set it, and an exact match was found in the `ASSET_MANIFEST`. That being said, this behavior was a bug, and unexpected behavior, as documented in [issue/158].

    [cherry]: https://github.com/Cherry
    [issue/158]: https://github.com/cloudflare/kv-asset-handler/pull/158
    [pull/159]: https://github.com/cloudflare/kv-asset-handler/pull/159

  - **Etag logic refactor - [shagamemnon], [pull/133]**

    This PR refactors a great deal of the Etag functionality introduced in [0.0.11](https://github.com/cloudflare/kv-asset-handler/milestone/7?closed=1). `kv-asset-handler` will now correctly set [strong and weak Etags](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag) both to the Cloudflare CDN and to client eyeballs, allowing for higher cache percentages with Workers Sites projects.

    [pull/133]: https://github.com/cloudflare/kv-asset-handler/pull/133
    [shagamemnon]: https://github.com/shagamemnon

  - **Fix path decoding issue - [xiaolanglanglang], [pull/142]**

    This PR improves support for non-alphanumeric character paths in `kv-asset-handler`, for instance, if the path requested is in Chinese.

    [xiaolanglanglang]: https://github.com/xiaolanglanglang
    [pull/142]: https://github.com/cloudflare/kv-asset-handler/pull/142

  - **Check HTTP method after mapRequestToAsset - [oliverpool], [pull/178]**

    This PR fixes an issue where the HTTP method for an asset is checked before the `mapRequestToAsset` handler is called. This has caused issues for users in the past, where they need to generate a `requestKey` based on an asset path, even if the request method is not `GET`. This fixes [issue/151].

    [oliverpool]: https://github.com/oliverpool
    [pull/178]: https://github.com/cloudflare/kv-asset-handler/pull/178
    [issue/151]: https://github.com/cloudflare/kv-asset-handler/issues/151

- ### Maintenance

  - **Add Markdown linting workflow to GitHub Actions - [jbampton], [pull/135]**

    Our GitHub Actions workflow now includes a linting workflow for Markdown in the project, including the README, this CHANGELOG, and any other `.md` files in the source code.

    [jbampton]: https://github.com/jbampton
    [pull/135]: https://github.com/cloudflare/kv-asset-handler/pull/135

  - **Dependabot updates**

    A number of dependabot patch-level updates have been merged since our last release:

    - Bump @types/node from 15.30.0 to 15.30.1 ([pull/180])
    - Bump hosted-git-info from 2.8.8 to 2.8.9 ([pull/176])
    - Bump ini from 1.3.5 to 1.3.8 ([pull/160])
    - Bump lodash from 4.17.19 to 4.17.21 ([pull/175])
    - Bump urijs from 1.19.2 to 1.19.6 ([pull/168])
    - Bump y18n from 4.0.0 to 4.0.1 ([pull/173])

    [pull/160]: https://github.com/cloudflare/kv-asset-handler/pull/160
    [pull/168]: https://github.com/cloudflare/kv-asset-handler/pull/168
    [pull/173]: https://github.com/cloudflare/kv-asset-handler/pull/173
    [pull/175]: https://github.com/cloudflare/kv-asset-handler/pull/175
    [pull/176]: https://github.com/cloudflare/kv-asset-handler/pull/176
    [pull/180]: https://github.com/cloudflare/kv-asset-handler/pull/180

  - **Repository maintenance - [Cherry], [pull/179]**

    New project maintainer Cherry did a ton of maintenance in this release, improving workflows, code quality, and more. Check out the full list in [the PR][pull/179].

    [cherry]: https://github.com/Cherry
    [pull/179]: https://github.com/cloudflare/kv-asset-handler/pull/179

- ### Documentation

  - **Update README.md - [signalnerve], [pull/177]**

    This PR adds context to our README, with mentions about _what_ this project is, how to use it, and some new things since the last version of this package: namely, [Cloudflare Pages](https://pages.dev) and the new [Cloudflare Workers Discord server](https://discord.gg/cloudflaredev)

    [signalnerve]: https://github.com/signalnerve
    [pull/177]: https://github.com/cloudflare/kv-asset-handler/pull/177

  - **Add instructions for updating version in related repos - [caass], [pull/171]**

    This PR adds instructions for updating the `kv-asset-handler` version in related repositories, such as our templates, that use `kv-asset-handler` and are exposed to end-users of Wrangler and Workers.

    [caass]: https://github.com/caass
    [pull/177]: https://github.com/cloudflare/kv-asset-handler/pull/171

## 0.1.1

- ### Fixes

  - **kv-asset-handler can translate 206 responses to 200 - [harrishancock], [pull/166]**

  Fixes [wrangler#1746](https://github.com/cloudflare/wrangler/issues/1746)

  [harrishancock](https://github.com/harrishancock)
  [pull/166](https://github.com/cloudflare/kv-asset-handler/pull/166)

## 0.0.12

- ### Features

  - **Add defaultMimeType option to getAssetFromKV - [mgrahamjo], [pull/121]**

    Some static website owners prefer not to create all of their web routes as directories containing index.html files. Instead, they prefer to create pages as extensionless HTML files. Providing a defaultMimeType option will allow users to set the Content-Type header for extensionless files to text/html, which will enable this use case.

    [mgrahamjo]: https://github.com/mgrahamjo
    [pull/121]: https://github.com/cloudflare/kv-asset-handler/pull/121

  - **Add defaultMimeType to types - [shagamemnon], [pull/132]**

    Adds the newly added defaultMimeType to the exported types for this package.

    [pull/132]: https://github.com/cloudflare/kv-asset-handler/pull/132

- ### Fixes

  - **Fix text/\* charset - [EatonZ], [pull/130]**

    Adds a missing `-` to the `utf-8` charset value in response mime types.

    [eatonz]: https://github.com/EatonZ
    [pull/130]: https://github.com/cloudflare/kv-asset-handler/pull/130

  - **Cache handling for HEAD requests - [klittlepage], [pull/141]**

    This PR skips caching for incoming HEAD requests, as they should not be able to be edge cached.

    [klittlepage]: https://github.com/klittlepage
    [pull/141]: https://github.com/cloudflare/kv-asset-handler/pull/141

- ### Maintenance

  - **Markdown linting/typos - [jbampton], [pull/123], [pull/125], [pull/126], [pull/127], [pull/128], [pull/129], [pull/131], [pull/134]**

    These PRs contain various typo fixes and linting of existing Markdown files in our documentation and CHANGELOG.

    [jbampton]: https://github.com/jbampton
    [pull/123]: https://github.com/cloudflare/kv-asset-handler/pull/123
    [pull/125]: https://github.com/cloudflare/kv-asset-handler/pull/125
    [pull/126]: https://github.com/cloudflare/kv-asset-handler/pull/126
    [pull/127]: https://github.com/cloudflare/kv-asset-handler/pull/127
    [pull/128]: https://github.com/cloudflare/kv-asset-handler/pull/128
    [pull/129]: https://github.com/cloudflare/kv-asset-handler/pull/129
    [pull/131]: https://github.com/cloudflare/kv-asset-handler/pull/131
    [pull/134]: https://github.com/cloudflare/kv-asset-handler/pull/134

## 0.0.11

- ### Features

  - **Support cache revalidation using ETags and If-None-Match - [shagamemnon], [issue/62] [pull/94] [pull/113]**

    Previously, cacheable resources were not looked up from the browser cache because `getAssetFromKV` would never return a `304 Not Modified` response.

    Now, `getAssetFromKV` sets an `ETag` header on all cacheable assets before putting them in the Cache API, and therefore will return a `304` response when appropriate.

    [shagamemnon]: https://github.com/shagamemnon
    [pull/94]: https://github.com/cloudflare/kv-asset-handler/pull/94
    [pull/113]: https://github.com/cloudflare/kv-asset-handler/issues/113
    [issue/62]: https://github.com/cloudflare/kv-asset-handler/issues/62

  - **Export TypeScript types - [ispivey], [issue/43] [pull/106]**

    [ispivey]: https://github.com/ispivey
    [pull/106]: https://github.com/cloudflare/kv-asset-handler/pull/106
    [issue/43]: https://github.com/cloudflare/kv-asset-handler/issues/43

- ### Fixes

  - **Support non-ASCII characters in paths - [SukkaW], [issue/99] [pull/105]**

    Fixes an issue where non-ASCII paths were not URI-decoded before being looked up, causing non-ASCII paths to 404.

    [sukkaw]: https://github.com/SukkaW
    [pull/105]: https://github.com/cloudflare/kv-asset-handler/pull/105
    [issue/99]: https://github.com/cloudflare/kv-asset-handler/issues/99

  - **Support `charset=utf8` in MIME type - [theromis], [issue/92] [pull/97]**

    Fixes an issue where `Content-Type: text/*` was never appended with `; charset=utf8`, meaning clients would not render non-ASCII characters properly.

    [theromis]: https://github.com/theromis
    [pull/97]: https://github.com/cloudflare/kv-asset-handler/pull/97
    [issue/92]: https://github.com/cloudflare/kv-asset-handler/issues/92

  - **Fix bugs in README examples - [kentonv] [bradyjoslin], [issue/93] [pull/102] [issue/88] [pull/116]**

    [kentonv]: https://github.com/kentonv
    [bradyjoslin]: https://github.com/bradyjoslin
    [pull/102]: https://github.com/cloudflare/kv-asset-handler/pull/102
    [pull/116]: https://github.com/cloudflare/kv-asset-handler/pull/116
    [issue/93]: https://github.com/cloudflare/kv-asset-handler/issues/93
    [issue/88]: https://github.com/cloudflare/kv-asset-handler/issues/88

- ### Maintenance

  - **Make `@cloudflare/workers-types` a dependency and update deps - [ispivey], [pull/107]**

    [ispivey]: https://github.com/ispivey
    [pull/107]: https://github.com/cloudflare/kv-asset-handler/pull/107

  - **Add Code of Conduct - [EverlastingBugstopper], [pull/101]**

    [everlastingbugstopper]: https://github.com/EverlastingBugstopper
    [pull/101]: https://github.com/cloudflare/kv-asset-handler/pull/101

## 0.0.10

- ### Features

  - **Allow extensionless files to be served - [victoriabernard92], [cloudflare/wrangler/issues/980], [pull/73]**

    Prior to this PR, `getAssetFromKv` assumed extensionless requests (e.g. `/some-path`) would be set up to be served as the corresponding HTML file in storage (e.g. `some-path.html`).
    This fix checks the `ASSET_MANIFEST` for the extensionless file name _before_ appending the HTML extension. If the extensionless file exists (e.g. `some-path` exists as a key in the ASSET_MANIFEST) then we serve that file first. If the extensionless file does not exist, then the behavior does not change (e.g. it still looks for `some-path.html`).

    [victoriabernard92]: https://github.com/victoriabernard92
    [cloudflare/wrangler/issues/980]: https://github.com/cloudflare/wrangler/issues/980
    [pull/73]: https://github.com/cloudflare/kv-asset-handler/pull/73

- ### Fixes

  - **Fix URL parsing in serveSinglePageApp - [signalnerve],[sgiacosa], [issue/72], [pull/82]**

    This fixes an issue in `serveSinglePageApp` where the request.url is used as a string to retrieve static content. For example,
    if a query parameter was set, the URL lookup would break. This fix uses a parsed URL instead of the string and adjusts the README.

    [signalnerve]: https://github.com/signalnerve
    [sgiacosa]: https://github.com/sgiacosa
    [issue/72]: https://github.com/cloudflare/kv-asset-handler/issue/72
    [pull/82]: https://github.com/cloudflare/kv-asset-handler/pull/82

## 0.0.9

- ### Fixes

  - **Building and publishing to npm - [victoriabernard92], [pull/78], [pull/79]**

    Added a `prepack` step that builds JavaScript files from the TypeScript source. This fixes previously broken `npm` publishes.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/78]: https://github.com/cloudflare/kv-asset-handler/issue/78
    [pull/79]: https://github.com/cloudflare/kv-asset-handler/pull/79

## 0.0.8

- ### Features

  - **Support a variety of errors thrown from `getAssetFromKV` - [victoriabernard92], [issue/59] [pull/64]**

    Previously, `getAssetFromKv` would throw the same error type if anything went wrong. Now it will throw different error types so that clients can catch and differentiate them.
    For example, a 404 `NotFoundError` error implies nothing went wrong, the asset just didn't exist while
    a 500 `InternalError` means an expected variable was undefined.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/44]: https://github.com/cloudflare/kv-asset-handler/issues/44
    [issue/59]: https://github.com/cloudflare/kv-asset-handler/issues/59
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/47

- ### Fixes

  - **Range Issue with Safari and videos - [victoriabernard92], [issue/60] [pull/66]**

    Previously, if you wanted to serve a video from Workers KV using `kv-asset-handler`, it would be broken on Safari due to its requirement that all videos support the [`Content-Range` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Range). Cloudflare already has a feature that will handle these headers automatically, we just needed to take advantage of it by passing in a `Request` object to the [Cache API](https://developers.cloudflare.com/workers/reference/apis/cache/) rather than a URL string.
    videos from not including the range headers.

    [victoriabernard92]: https://github.com/victoriabernard92
    [shagamemnon]: https://github.com/shagamemnon
    [issue/60]: https://github.com/cloudflare/kv-asset-handler/issues/60
    [issue/63]: https://github.com/cloudflare/kv-asset-handler/issues/63
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/52
    [pull/66]: https://github.com/cloudflare/kv-asset-handler/pull/66

  - **Support custom asset namespaces passed into `getAssetFromKV` - [victoriabernard92], [issue/67] [pull/68]**

    This functionality was documented but not properly supported. Tests and implementation fixes applied.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/67]: https://github.com/cloudflare/kv-asset-handler/issues/67
    [pull/68]: https://github.com/cloudflare/kv-asset-handler/pull/68

## 0.0.7

- ### Features

  - **Add handler for SPAs - [ashleymichal], [issue/46] [pull/47]**

    Some browser applications employ client-side routers that handle navigation in the browser rather than on the server. These applications will work as expected until a non-root URL is requested from the server. This PR adds a special handler, `serveSinglePageApp`, that maps all HTML requests to the root index.html. This is similar to setting a static asset route pattern in an Express.js app.

    [ashleymichal]: https://github.com/ashleymichal
    [issue/46]: https://github.com/cloudflare/kv-asset-handler/issues/46
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/47

- ### Documentation

  - **Add function API for `getAssetFromKV` to README.md - [ashleymichal], [issue/48] [pull/52]**

    This function, used to abstract away the implementation for retrieving static assets from a Workers KV namespace, includes a lot of great options for configuring your own, bespoke "Workers Sites" implementation. This PR adds documentation to the README for use by those who would like to tinker with these options.

    [ashleymichal]: https://github.com/ashleymichal
    [issue/46]: https://github.com/cloudflare/kv-asset-handler/issues/48
    [pull/47]: https://github.com/cloudflare/kv-asset-handler/pull/52

## 0.0.6

- ### Fixes

  - **Improve caching - [victoriabernard92], [issue/38] [pull/37]**

    - Don't use browser cache by default: Previously, `kv-asset-handler` would set a `Cache-Control` header on the response sent back from the Worker to the client. After this fix, the `Cache-Control` header will only be set if `options.cacheControl.browserTTL` is set by the caller.

    - Set default edge caching to 2 days: Previously the default cache time for static assets was 100 days. This PR sets the default to 2 days. This can be overridden with `options.cacheControl.edgeTTL`.

    [victoriabernard92]: https://github.com/victoriabernard92
    [issue/38]: https://github.com/cloudflare/kv-asset-handler/issues/38
    [pull/37]: https://github.com/cloudflare/kv-asset-handler/pull/37
