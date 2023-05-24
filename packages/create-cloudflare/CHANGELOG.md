# create-cloudflare

## 2.0.8

### Patch Changes

- [#3260](https://github.com/khulnasoft/workers-sdk/pull/3260) [`7249f344`](https://github.com/khulnasoft/workers-sdk/commit/7249f344109fe1a8f67859e9aff227c7951bc6b9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: add polling for deployed Pages projects

  When create-cloudflare deploys to Pages, it can take a while before the website is ready to be viewed.
  This change adds back in polling of the site and then opening a browser when the URL is ready.

* [#3272](https://github.com/khulnasoft/workers-sdk/pull/3272) [`57f80551`](https://github.com/khulnasoft/workers-sdk/commit/57f80551961c2f67bf057591518d573f71a51c8f) Thanks [@markdalgleish](https://github.com/markdalgleish)! - Use full Remix template URL rather than the `cloudflare-pages` shorthand since it will be removed in a future version of `create-remix`

- [#3291](https://github.com/khulnasoft/workers-sdk/pull/3291) [`c1be44c8`](https://github.com/khulnasoft/workers-sdk/commit/c1be44c8ef64f18dbd65a2399e845d3df1d0c1f2) Thanks [@Cherry](https://github.com/Cherry)! - fix: specify correct startup command in logs for newly created c3 projects

## 2.0.7

### Patch Changes

- [#3283](https://github.com/khulnasoft/workers-sdk/pull/3283) [`74decfa7`](https://github.com/khulnasoft/workers-sdk/commit/74decfa768b7a8ba0f04cf6f437ef075629fb6a7) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: Use correct path to worker source in triangle.toml of JavaScript simple template

## 2.0.6

### Patch Changes

- [#3273](https://github.com/khulnasoft/workers-sdk/pull/3273) [`20479027`](https://github.com/khulnasoft/workers-sdk/commit/204790272a813a511837a660d3d3143d8996f641) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: support spawning new processes on Windows

* [#3282](https://github.com/khulnasoft/workers-sdk/pull/3282) [`e9210590`](https://github.com/khulnasoft/workers-sdk/commit/e9210590d3406fe899170542b67286b2ae299fe9) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: ensure templates are included in deployed package

## 2.0.5

### Patch Changes

- [#3267](https://github.com/khulnasoft/workers-sdk/pull/3267) [`186eed94`](https://github.com/khulnasoft/workers-sdk/commit/186eed94050d2224eb70799b2d2611d9dba91515) Thanks [@KianNH](https://github.com/KianNH)! - [C3] Fix Worker path in JavaScript template

## 2.0.3

### Patch Changes

- [#3247](https://github.com/khulnasoft/workers-sdk/pull/3247) [`db9f0e92`](https://github.com/khulnasoft/workers-sdk/commit/db9f0e92b39cfe0377c3c624a84a1db1385afb1a) Thanks [@eneajaho](https://github.com/eneajaho)! - Update versionMap.json to include angular @16.0.x rather than @next

* [#3242](https://github.com/khulnasoft/workers-sdk/pull/3242) [`739bd656`](https://github.com/khulnasoft/workers-sdk/commit/739bd65624386dcf020c07190e8427b59a9e6229) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - fix: correctly format the compatibility_date field in generated triangle.toml

  Fixes #3240

- [#3253](https://github.com/khulnasoft/workers-sdk/pull/3253) [`7cefb4db`](https://github.com/khulnasoft/workers-sdk/commit/7cefb4dbe7d0c6117401fd0e182e112f94f566a7) Thanks [@sidharthachatterjee](https://github.com/sidharthachatterjee)! - use triangle@3 as devDep in C3 worker templates

## 2.0.2

### Patch Changes

- [#3238](https://github.com/khulnasoft/workers-sdk/pull/3238) [`9973ea29`](https://github.com/khulnasoft/workers-sdk/commit/9973ea2953873c1d9d1822dfc35fd04bc321677a) Thanks [@jculvey](https://github.com/jculvey)! - Bumping version of qwik to 1.1.x
