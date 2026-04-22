# @cloudflare/local-explorer-ui

## 0.13.2

### Patch Changes

- [#13562](https://github.com/cloudflare/workers-sdk/pull/13562) [`78a252d`](https://github.com/cloudflare/workers-sdk/commit/78a252dbf7fc818b56db2f0870c60d4f49e2f4c5) Thanks [@emily-shen](https://github.com/emily-shen)! - Local Explorer UI refinements

  - Add scrolling to the D1 table selector, instead of cutting off the table list
  - Show table headers in R2 empty states
  - Persist the `delimiter` search param when navigating to R2 object details
  - Hide breadcrumb path segments when viewing R2 objects in ungrouped mode

## 0.13.1

### Patch Changes

- [#13466](https://github.com/cloudflare/workers-sdk/pull/13466) [`c4461ff`](https://github.com/cloudflare/workers-sdk/commit/c4461ff25ec9cb6266ad0da240bed8a755de7d08) Thanks [@NuroDev](https://github.com/NuroDev)! - Fix local explorer KV bulk / get for large payloads.

  Fixes an issue where the local explorer UI would crash when fetching large KV payloads.

  Additionally, the local KV bulk get API endpoint now enforces a total 25MB payload limit, in alignment with the remote Cloudflare API.

- [#13543](https://github.com/cloudflare/workers-sdk/pull/13543) [`39a5f04`](https://github.com/cloudflare/workers-sdk/commit/39a5f04792f5e0ec12ff727fe9cb07e1f4516094) Thanks [@SAY-5](https://github.com/SAY-5)! - Fix `occured` -> `occurred` typo in the `ResourceError` fallback message rendered by the local explorer UI when a worker resource fails to load.

## 0.13.0

### Minor Changes

- [#13429](https://github.com/cloudflare/workers-sdk/pull/13429) [`54ceb95`](https://github.com/cloudflare/workers-sdk/commit/54ceb950c38d9b09f18de2e7a3db18c8d9fa2827) Thanks [@NuroDev](https://github.com/NuroDev)! - Add shift-click multi-select to R2 object list

  Shift-clicking a checkbox in the R2 object list now selects or deselects a contiguous range of rows between the last individually clicked row (the anchor) and the shift-clicked row. This matches standard shift-select behavior in file managers and data tables.

## 0.12.0

### Minor Changes

- [#13330](https://github.com/cloudflare/workers-sdk/pull/13330) [`b30eb67`](https://github.com/cloudflare/workers-sdk/commit/b30eb67130e9b7f7ac30d4e62f16d27f4ea37c8e) Thanks [@NuroDev](https://github.com/NuroDev)! - Update local explorer sidebar with collapsible groups, theme persistence, and Kumo v1.17

  Adds localStorage persistence for sidebar group expansion states and theme mode (light/dark/system). The sidebar now uses Kumo v1.17 primitives with collapsible groups and a theme toggle in the footer.

  Users can now cycle between light, dark, and system theme modes, and their preference will be persisted across sessions.

  Sidebar groups (D1, Durable Objects, KV, R2, Workflows) also remember their collapsed/expanded state.

### Patch Changes

- [#13361](https://github.com/cloudflare/workers-sdk/pull/13361) [`a4f1d5c`](https://github.com/cloudflare/workers-sdk/commit/a4f1d5cf9a49b45f1dcc054858f85e7c9bff85ff) Thanks [@NuroDev](https://github.com/NuroDev)! - Cleaned up local explorer workflows page design.

  The core design & layout of the workflows page(s) in the local explorer has been tweaked to make it more uniform and consistent with all other resource pages.

- [#13407](https://github.com/cloudflare/workers-sdk/pull/13407) [`496c5d5`](https://github.com/cloudflare/workers-sdk/commit/496c5d5bab56b59d11fc02fa077c1a246681416c) Thanks [@NuroDev](https://github.com/NuroDev)! - Add new "Copy prompt for agent" button.

  This adds a clipboard copy field to the Local Explorer homepage for sharing an agent/LLM Local Explorer API prompt.

- [#13158](https://github.com/cloudflare/workers-sdk/pull/13158) [`67be6b0`](https://github.com/cloudflare/workers-sdk/commit/67be6b0ab97b0b5f85f9fbae93655ab390e8dbf9) Thanks [@NuroDev](https://github.com/NuroDev)! - Improves local explorer invalid route error handling.

  Visiting a route either as a 404 or 500 error now has dedicated components to handle as such, rather than the generic TanStack error UI.

  Additionally, it also fixes route loaders to correctly throw a 404 error if a resource is not found, rather than showing a generic error.

- [#13407](https://github.com/cloudflare/workers-sdk/pull/13407) [`496c5d5`](https://github.com/cloudflare/workers-sdk/commit/496c5d5bab56b59d11fc02fa077c1a246681416c) Thanks [@NuroDev](https://github.com/NuroDev)! - Updates the Local Explorer homepage prompt to use the current runtime origin for the Explorer API endpoint.

  This ensures copied prompt text points to the correct local URL instead of a placeholder localhost port.

## 0.11.0

### Minor Changes

- [#13331](https://github.com/cloudflare/workers-sdk/pull/13331) [`a066e24`](https://github.com/cloudflare/workers-sdk/commit/a066e245ef5357c33609d19797123ec9b6c294f7) Thanks [@NuroDev](https://github.com/NuroDev)! - Add animated Cloudflare logo to local explorer homepage

  The local explorer now displays an animated Cloudflare logo on the homepage,
  providing a more engaging visual experience when viewing local resources.

- [#13133](https://github.com/cloudflare/workers-sdk/pull/13133) [`42c7ef0`](https://github.com/cloudflare/workers-sdk/commit/42c7ef04385094c77f0c2830134fc38b2dc39b02) Thanks [@emily-shen](https://github.com/emily-shen)! - explorer: list DO instances with name where possible

  Note: The local explorer is a WIP experimental feature.

- [#13336](https://github.com/cloudflare/workers-sdk/pull/13336) [`a42e0e8`](https://github.com/cloudflare/workers-sdk/commit/a42e0e8b52df128513f85025f50eb985bc7f5748) Thanks [@emily-shen](https://github.com/emily-shen)! - local explorer: fix handling on resources that are bound to multiple workers

  Note the local explorer is a experimental feature still.

## 0.10.0

### Minor Changes

- [#13161](https://github.com/cloudflare/workers-sdk/pull/13161) [`f071008`](https://github.com/cloudflare/workers-sdk/commit/f07100810d6d8c00e7d1977f0b760b369b52aed0) Thanks [@NuroDev](https://github.com/NuroDev)! - Overhaul local explorer UI color palette.

  The core styles of the local explorer has been overhauled to remove all custom styles in favour of using Kumo styles / colors when possible.

  This is the first part of improving the local explorer UI to kumo-ify it all.

## 0.9.0

### Minor Changes

- [#12972](https://github.com/cloudflare/workers-sdk/pull/12972) [`cb71403`](https://github.com/cloudflare/workers-sdk/commit/cb714036d95ad0429f7e7a24c3c3a4317748ce22) Thanks [@NuroDev](https://github.com/NuroDev)! - Add worker filtering to the local explorer UI

  When multiple workers share a dev registry, all their bindings were previously shown together in a single flat list. The explorer now shows a worker selector dropdown, letting you inspect each worker's bindings independently.

  The selected worker is reflected in the URL as a `?worker=` search param, so deep links work correctly. By default the explorer selects the worker that is hosting the dashboard itself.

- [#12888](https://github.com/cloudflare/workers-sdk/pull/12888) [`3a1c149`](https://github.com/cloudflare/workers-sdk/commit/3a1c149e1edf126ab072bf74ed624d3c42d561fb) Thanks [@emily-shen](https://github.com/emily-shen)! - Add R2 support to the local explorer.

  The local explorer now supports the following:

  - Viewing, modifying & deleting objects
  - Uploading files
  - Creating directories / prefixes

  Note: The local explorer is an experimental WIP feature that is now enabled by default. This can still be opt-ed out of by using `X_LOCAL_EXPLORER=false` to disable it.

### Patch Changes

- [#12918](https://github.com/cloudflare/workers-sdk/pull/12918) [`3de3ce5`](https://github.com/cloudflare/workers-sdk/commit/3de3ce519383b634bd1315eb94d789ec8def0670) Thanks [@NuroDev](https://github.com/NuroDev)! - Fixed listing internal Cloudflare Durable Object tables.

  The internal `_cf_KV` table that is used when using Durable Objects KV storage is now hidden from the table list dropdown in the local explorer as it is not accessible.

## 0.8.2

### Patch Changes

- [#12877](https://github.com/cloudflare/workers-sdk/pull/12877) [`7dc3fb3`](https://github.com/cloudflare/workers-sdk/commit/7dc3fb36b1af4740f14409d8cdf9c50d8942a4df) Thanks [@NuroDev](https://github.com/NuroDev)! - Fixed table selection dropdown incorrect z-index.

  Previously, the dropdown you used to select a table in the data studio had an incorrect or missing z-index, meanint it conflicted with the table row header & was partially cut off when you had too many tables. This change ensures that the dropdown is always "on top" and visible.

## 0.8.1

### Patch Changes

- [#12864](https://github.com/cloudflare/workers-sdk/pull/12864) [`ecc7f79`](https://github.com/cloudflare/workers-sdk/commit/ecc7f792f950fc786ff40fa140bd8907bd26ff31) Thanks [@NuroDev](https://github.com/NuroDev)! - Fix local explorer's sidebar header link to point to the correct `/cdn-cgi/explorer/` path rather than `/`.

## 0.8.0

### Minor Changes

- [#12754](https://github.com/cloudflare/workers-sdk/pull/12754) [`e4d9510`](https://github.com/cloudflare/workers-sdk/commit/e4d9510c3439d313ba0e0f78bf00d0726d5f67e9) Thanks [@emily-shen](https://github.com/emily-shen)! - Add cross-process support to the local explorer

  When running multiple miniflare processes, the local explorer will now be able to view and edit resources that are bound to workers in other miniflare instances.

### Patch Changes

- [#12828](https://github.com/cloudflare/workers-sdk/pull/12828) [`cb14820`](https://github.com/cloudflare/workers-sdk/commit/cb148200336ed57c56cb89028453ddd5fdef2e7b) Thanks [@jamesopstad](https://github.com/jamesopstad)! - Update `@hey-api/openapi-ts` to ^0.94.0

- [#12779](https://github.com/cloudflare/workers-sdk/pull/12779) [`b2f8b47`](https://github.com/cloudflare/workers-sdk/commit/b2f8b47b19ef2a2235130a681da002206ef4c4e6) Thanks [@NuroDev](https://github.com/NuroDev)! - Refactors KV & sidebar to use route loaders.

  This change improves the user experience of the Local Explorer dashboard by ensuring that the data used for the initial render is fetched server-side and passed down to the client. This avoids the initial flicker when loading in. Both D1 & Durable Object routes already incorporate this system.

## 0.7.0

### Minor Changes

- [#12453](https://github.com/cloudflare/workers-sdk/pull/12453) [`9764ea0`](https://github.com/cloudflare/workers-sdk/commit/9764ea09e0e106e96a403db8e99d41ad3f00ef98) Thanks [@NuroDev](https://github.com/NuroDev)! - Add initial data studio with D1 and Durable Objects support

  Adds a data studio interface to the local explorer UI, allowing you to browse and interact with D1 databases and Durable Objects during local development. The studio provides table browsing, query execution, and data editing capabilities.

- [#12760](https://github.com/cloudflare/workers-sdk/pull/12760) [`fa88fef`](https://github.com/cloudflare/workers-sdk/commit/fa88fef992bd8e65d00d1e7d279bf62ee9120ce8) Thanks [@NuroDev](https://github.com/NuroDev)! - Add schema editor to data studio

  Adds a visual schema editor to the data studio that allows you to create new database tables and edit existing table schemas. The editor provides column management (add, edit, remove), constraint editing (primary keys, unique constraints), and generates the corresponding SQL statements for review before committing changes.

  This is a WIP experimental feature.

## 0.6.0

### Minor Changes

- [#12599](https://github.com/cloudflare/workers-sdk/pull/12599) [`3649d3e`](https://github.com/cloudflare/workers-sdk/commit/3649d3e408bf352468a59e47f05f42c9bd69c736) Thanks [@NuroDev](https://github.com/NuroDev)! - Adds the tab definition for the table explorer.

  This serves as another stepping stone for adding the complete data studio to the local explorer.

  This is a WIP experimental feature.

## 0.5.0

### Minor Changes

- [#12570](https://github.com/cloudflare/workers-sdk/pull/12570) [`01ded52`](https://github.com/cloudflare/workers-sdk/commit/01ded5289e744e6f604edcbffdd6b1c95e6339c0) Thanks [@NuroDev](https://github.com/NuroDev)! - Add the initial plumbing for data studio components.

  This serves as another stepping stone for adding the complete data studio to the local explorer.

  This is a WIP experimental feature.

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
