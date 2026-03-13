# `@cloudflare/workflows-shared`

This is a package that is used at Cloudflare to power some internal features of [Cloudflare Workflows](https://developers.cloudflare.com/workflows/), as well as their open-source equivalents here in workers-sdk and Wrangler.

> [!NOTE]
> Since code in this package is used by the Workflows infrastructure, it is important that PRs are given careful review with regards to how they could cause a failure in production.
> Ideally, there should be comprehensive tests for changes being made to give extra confidence about the behavior.
