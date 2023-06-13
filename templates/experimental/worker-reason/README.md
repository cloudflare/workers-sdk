# Reason hello world for Cloudflare Workers

Your [Reason](https://reasonml.github.io/) code in [Demo.re](https://github.com/cloudflare/reason-worker-hello-world/blob/master/src/Demo.re), running on Cloudflare Workers

In addition to [Wrangler](https://github.com/cloudflare/wrangler) you will need to [install BuckleScript](https://reasonml.github.io/docs/en/installation) using npm or Yarn.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-reason --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-reason --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-reason --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.


## Wrangler

Wrangler is used to develop, deploy, and configure your Worker via CLI.

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).

## BuckleScript

After installing BuckleScript per the linked instructions above,

```sh
cd projectname

# assuming you installed BuckleScript globally, need to run this once
npm link bs-platform

npm run build
```

That will compile your code into src/Demo.bs.js, after which you can run `wrangler deploy` to push it to Cloudflare.

If you just want to check for errors during development, `npm run start` will watch for filesystem changes and recompile.

For more information on how BuckleScript translates Reason and Ocaml to JavaScript, see the [docs](https://reasonml.github.io/docs/en/interop).
