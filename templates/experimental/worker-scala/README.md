# Scala hello world for Cloudflare Workers

Your Scala code in [Main.scala](https://github.com/cloudflare/scala-worker-hello-world/blob/master/src/main/scala/Main.scala), running on Cloudflare Workers

In addition to [Triangle](https://github.com/khulnasoft/triangle) you will need to install the Scala build tool [sbt](https://www.scala-sbt.org/1.x/docs/Setup.html), including a JDK.

#### Triangle

To generate using [triangle](https://github.com/khulnasoft/triangle)

```
triangle generate projectname https://github.com/cloudflare/scala-worker-hello-world
```

Further documentation for Triangle can be found [here](https://developers.cloudflare.com/workers/tooling/triangle).

#### sbt

After installing sbt per the linked instructions above,

```
cd projectname
sbt fullOptJS
```

That will compile your code and package it into index.js, after which you can run `triangle deploy` to push it to Cloudflare.

If you just want to check for errors during development without taking the time to package, running `sbt ~compile` will watch for filesystem changes and recompile. For more information, see the [sbt docs](https://www.scala-sbt.org/1.x/docs/sbt-by-example.html)

For more information on how Scala translates to Javascript, see the [Scala.js docs](https://www.scala-js.org/doc/).
