# Scala hello world for Cloudflare Workers

Your Scala code in [Main.scala](https://github.com/cloudflare/scala-worker-hello-world/blob/master/src/main/scala/Main.scala), running on Cloudflare Workers

In addition to [Wrangler](https://github.com/cloudflare/wrangler) you will need to install the Scala build tool [sbt](https://www.scala-sbt.org/1.x/docs/Setup.html), including a JDK.

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-scala --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-scala --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-scala --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

## Wrangler

Wrangler is used to develop, deploy, and configure your Worker via CLI.

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).


## sbt

After installing sbt per the linked instructions above,

```sh
cd projectname
sbt fullOptJS
```

That will compile your code and package it into index.js, after which you can run `wrangler deploy` to push it to Cloudflare.

If you just want to check for errors during development without taking the time to package, running `sbt ~compile` will watch for filesystem changes and recompile. For more information, see the [sbt docs](https://www.scala-sbt.org/1.x/docs/sbt-by-example.html)

For more information on how Scala translates to Javascript, see the [Scala.js docs](https://www.scala-js.org/doc/).
