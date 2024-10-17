<h1 align="center">Cloudflare Workers SDK</h1>

<p align="center">
<img src="cloudflare-workers-outline.png" alt="workers-logo" width="120px" height="120px"/>
  <br>
  Cloudflare Workers let you deploy serverless code instantly across the globe for exceptional performance, reliability, and scale.
  <br>
</p>

<p align="center">
  <a href="CONTRIBUTING.md">Contribute</a>
  ·
  <a href="https://github.com/cloudflare/workers-sdk/issues">Submit an Issue</a>
  ·
  <a href="https://discord.cloudflare.com/">Join Discord</a>
  <br>
  <br>
</p>

<p align="center">
  <a href="https://www.npmjs.com/wrangler/">
    <img src="https://img.shields.io/npm/v/wrangler.svg?logo=npm&logoColor=fff&label=NPM+package&color=orange" alt="Wrangler on npm" />
  </a>&nbsp;
  <a href="https://discord.cloudflare.com/">
    <img src="https://img.shields.io/discord/595317990191398933.svg?logo=discord&logoColor=fff&label=Discord&color=7389d8" alt="Discord conversation" />
  </a>&nbsp;
  <a href="https://twitter.com/CloudflareDev">
    <img src="https://img.shields.io/twitter/follow/cloudflaredev" alt="X conversation" />
  </a>
</p>

<hr>

## Quick Start

To get started quickly with a new project, run the command below:

```bash
npm create cloudflare@latest
# or
pnpm create cloudflare@latest
# or
yarn create cloudflare@latest
```

For more info, visit our [Getting Started](https://developers.cloudflare.com/workers/get-started/guide/) guide.

## Documentation

Visit the official Workers documentation [here](https://developers.cloudflare.com/workers/).

- [Getting Started](https://developers.cloudflare.com/workers/get-started/guide/)
- [How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Observability](https://developers.cloudflare.com/workers/observability/)
- [Platform](https://developers.cloudflare.com/workers/platform/)

## Directory

| Package                                                                                                    | Description                                                                                                            | Links                                                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`wrangler`](https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler)                        | A command line tool for building [Cloudflare Workers](https://workers.cloudflare.com/).                                | [Docs](https://developers.cloudflare.com/workers/wrangler/)     |
| [`create-cloudflare` (C3)](https://github.com/cloudflare/workers-sdk/tree/main/packages/create-cloudflare) | A CLI for creating and deploying new applications to Cloudflare.                                                       | [Docs](https://developers.cloudflare.com/pages/get-started/c3/) |
| [`miniflare`](https://github.com/cloudflare/workers-sdk/tree/main/packages/miniflare)                      | A simulator for developing and testing Cloudflare Workers, powered by [workerd](https://github.com/cloudflare/workerd) | [Docs](https://miniflare.dev)                                   |
| [`wrangler-devtools`](https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler-devtools)      | Cloudflare's fork of Chrome DevTools for inspecting your local or remote Workers                                       |                                                                 |
| [`pages-shared`](https://github.com/cloudflare/workers-sdk/tree/main/packages/pages-shared)                | Used internally to power Wrangler and Cloudflare Pages. It contains all the code that is shared between these clients. |                                                                 |

## Contributing

We welcome new contributors! Refer to the [`CONTRIBUTING.md`](/CONTRIBUTING.md) guide for details.

## Community

Join us in the official [Cloudflare Discord](https://discord.cloudflare.com/) to meet other developers, ask questions, or learn more in general.

## Links

- [Project Board](https://github.com/orgs/cloudflare/projects/1)
- [Discussions](https://github.com/cloudflare/workers-sdk/discussions)
