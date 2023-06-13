# PHP hello world for Cloudflare Workers

Your PHP code in [index.php](https://github.com/cloudflare/php-worker-hello-world/blob/master/index.php), running on Cloudflare Workers

This project uses [babel-preset-php](https://gitlab.com/kornelski/babel-preset-php) to convert PHP to JavaScript.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-php --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-php --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-php --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.


## Wrangler

Wrangler is used to develop, deploy, and configure your Worker via CLI.

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).

## babel-preset-php

```sh
cd projectname

# run once to install babel-preset-php and dependencies
npm install

# run every time you update index.php
npm run build
```

That will compile your code into index.js, after which you can run `wrangler deploy` to push it to Cloudflare.

For more information on how PHP translates to JavaScript, see the [docs for babel-preset-php](https://gitlab.com/kornelski/babel-preset-php).
