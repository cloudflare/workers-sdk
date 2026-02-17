# @cloudflare/local-explorer-ui

## 0.4.0

### Minor Changes

- [#12518](https://github.com/cloudflare/workers-sdk/pull/12518) [`323f14e`](https://github.com/cloudflare/workers-sdk/commit/323f14e19605f3f0eb732992fa6d765657cb93ba) Thanks [@NuroDev](https://github.com/NuroDev)! - Implemented initial data studio driver support.

  This provides the initial plumbing needed to add the complete data studio component to the local explorer in a later PR. D1 databases will now appear in the sidebar alongside KV namespaces when running the local explorer.

  This is an experimental WIP feature.

- [#12555](https://github.com/cloudflare/workers-sdk/pull/12555) [`2eeefeb`](https://github.com/cloudflare/workers-sdk/commit/2eeefeb01ddb6d44b99e3ea93a1b9faada925cb3) Thanks [@NuroDev](https://github.com/NuroDev)! - Add database table selection dropdown.

  As part of the ongoing work to implement the data studio into the local explorer, this change allows you to view and select which table for a database you want to inspect.

  This is an experimental WIP feature.

## 0.3.0

### Minor Changes

- [#12431](https://github.com/cloudflare/workers-sdk/pull/12431) [`7aaa2a5`](https://github.com/cloudflare/workers-sdk/commit/7aaa2a5aa93011bd03aa0998c7310fa6e1eaff41) Thanks [@emily-shen](https://github.com/emily-shen)! - Add ability to search KV keys by prefix

  The UI and list keys API now lets you search KV keys by prefix.

  This is an experimental WIP feature.

## 0.2.0

### Minor Changes

- [#12459](https://github.com/cloudflare/workers-sdk/pull/12459) [`e3e9ca9`](https://github.com/cloudflare/workers-sdk/commit/e3e9ca9453cbbbb5652f7798c8ad7b0897f5fa32) Thanks [@NuroDev](https://github.com/NuroDev)! - Add dark mode support to the local explorer UI

  This includes adding an initial implementation that uses your preferred system theme to select what theme to render the local explorer UI in.

  Additionally, this includes a number of minor style tweaks & fixes.

  This is an experimental WIP feature.

- [#12391](https://github.com/cloudflare/workers-sdk/pull/12391) [`ce9dc01`](https://github.com/cloudflare/workers-sdk/commit/ce9dc01a4696e28bd9f3a900dd2f5a7783252906) Thanks [@emily-shen](https://github.com/emily-shen)! - Serve the local explorer UI from Miniflare

  This bundles the local explorer UI into Miniflare, and if enabled, Miniflare serves the UI at `/cdn-cgi/explorer`.

  This is an experimental, WIP feature.

### Patch Changes

- [#12414](https://github.com/cloudflare/workers-sdk/pull/12414) [`de473c2`](https://github.com/cloudflare/workers-sdk/commit/de473c2205250cbef2272d75e6dae50b064b1333) Thanks [@emily-shen](https://github.com/emily-shen)! - Change the favicon to a Cloudflare logo outline

  This is for an experimental WIP project.

## 0.1.0

### Minor Changes

- [#12288](https://github.com/cloudflare/workers-sdk/pull/12288) [`60eaf16`](https://github.com/cloudflare/workers-sdk/commit/60eaf16da41370b37ca215b9fcc8a8d9d0ea8171) Thanks [@emily-shen](https://github.com/emily-shen)! - Set up local explorer UI with a view for KV namespaces

  This is an experimental WIP package.
