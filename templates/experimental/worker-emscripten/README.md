# Template: worker-emscripten

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-emscripten)

A template for kick starting a Cloudflare worker project with emscripten

[`index.js`](index.js) is the content of the Workers script.
[`main.c`](src/main.c) is the c source code that calls into the stb image resizer library.
[`build.js`](build.js) holds the command we use to call emscripten.
[`webpack.config.js`](webpack.config.js) holds the webpack config we use to bundle the emscripten output together with your script.

This template requires [Docker](https://docs.docker.com/install/) for providing the emscripten build environment. While we believe this provides the best developer experience, if you wish to not use Docker you can delete the check for docker and the docker parts of the build command in `build.js`. Note this means you must have emscripten installed on your machine.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-emscripten --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-emscripten --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-emscripten --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

## Credits

Shoutout to [Surma](https://twitter.com/dassurma) for his [webpack-emscripten-wasm](https://gist.github.com/surma/b2705b6cca29357ebea1c9e6e15684cc) gist that was instrumental in getting this working!
