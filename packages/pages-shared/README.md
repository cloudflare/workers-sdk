# `@cloudflare/pages-shared`

This is a package that is used internally to power Wrangler and Cloudflare Pages. It contains all the code that is shared between these clients (and possibly any other in the future e.g. the dashboard).

Code should be written so that it can be run in almost any environment (e.g. Deno, Node, browser, Workers), but note that there's currently a bit of weirdness here for `asset-server`, hence the `environment-polyfills` piece.

> [!NOTE]
> Since code in this package is used by the Pages infrastructure, it is important that PRs are given careful review with regards to how they could cause a failure in production.
> Ideally, there should be comprehensive tests for changes being made to give extra confidence about the behavior.
