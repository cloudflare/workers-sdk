# Scala example of using Cloudflare Workers KV

[Main.scala](https://github.com/cloudflare/scala-worker-kv/blob/master/src/main/scala/Main.scala) is an example of using Cloudflare [Workers KV](https://developers.cloudflare.com/workers/reference/storage) from Scala.

In addition to [Wrangler](https://github.com/cloudflare/wrangler) you will need to install the Scala build tool [sbt](https://www.scala-sbt.org/1.x/docs/Setup.html), including a JDK.

#### Wrangler

To generate using [wrangler](https://github.com/cloudflare/wrangler)

```
wrangler generate projectname https://github.com/cloudflare/scala-worker-kv
```

When editing wrangler.toml to include your account_id, you will also need to add your kv namespace id to the binding under kv-namespaces.

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).

#### sbt

After installing sbt per the linked instructions above,

```
cd projectname
sbt fullOptJS
```

That will compile your code and package it into index.js, after which you can run `wrangler publish` to push it to Cloudflare.

If you just want to check for errors during development without taking the time to package, running `sbt ~compile` will watch for filesystem changes and recompile. For more information, see the [sbt docs](https://www.scala-sbt.org/1.x/docs/sbt-by-example.html)

For more information on how Scala translates to Javascript, see the [Scala.js docs](https://www.scala-js.org/doc/).
