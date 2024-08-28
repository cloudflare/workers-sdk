# `@cloudflare/workers-shared`

This is a package that is used at Cloudflare to power some internal features of [Cloudflare Workers](https://developers.cloudflare.com/workers/), as well as their open-source equivalents here in workers-sdk and Wrangler.

## `asset-worker`

The Asset Worker.

For more details please refer to the dedicated README file.

## `router-worker`

The Router Worker.

For more details please refer to the dedicated README file.

> [!NOTE]
> Since code in this package is used by the Workers infrastructure, it is important that PRs are given careful review with regards to how they could cause a failure in production.
> Ideally, there should be comprehensive tests for changes being made to give extra confidence about the behavior.
