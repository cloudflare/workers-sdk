# `@cloudflare/workers-shared`

This is a package that is used at Cloudflare to power some internal features of [Cloudflare Workers](https://developers.cloudflare.com/workers/), as well as their open-source equivalents here in workers-sdk and Wrangler.

> [!NOTE]
> Since code in this package is used by the Workers infrastructure, it is important that PRs are given careful review with regards to how they could cause a failure in production.
> Ideally, there should be comprehensive tests for changes being made to give extra confidence about the behavior.

## `asset-worker`

The Asset Worker.

For more details please refer to the dedicated README file.

## `router-worker`

The Router Worker.

For more details please refer to the dedicated README file.

## `Worker Deployment`

Router-worker and asset-worker are both version uploaded through the run `deploy` target in this package, which uploads a new version of these Workers.

There are two ways that the `deploy` script target can be invoked:

- The `changesets` workflow will execute whenever there is a release of `@cloudflare/workers-shared`
- If a change is needed prior to a workers-shared release, it can be done manually, via the `workers-shared-deploy-production` workflow. This workflow will upload new vesions of asset-worker and router-worker based on the code in the `main` branch. (Note, a duplicate version may be uploaded on the next workers-shared release, if there is an associated changeset)

The pnpm `deploy` script should not be run manually.

Once new versions are uploaded (through either the manual workflow, or the changesets workflow), they can be safely deployed and monitored using Gradual Deployments through Health Mediated Deployments.
