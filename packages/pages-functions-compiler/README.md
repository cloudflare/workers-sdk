# Pages Functions Compiler

Pages Functions Compiler compiles Pages functions. It produces a bundled worker script containing all of the User Functions in a Pages project along with some glue code to handle routing between them.

## Getting started

If you've just checked out the repo locally, you can build the app and run it on the example project using

```shell
yarn example
```

This will output a bundled worker script to `out/worker-bundle.js`.

## How it works

The first step of the program is to interpret the config file to produce two things: a set of import statements that import the specified user function modules, and an array of routes mapping those modules to request paths.
Next, that array of routes is injected (via ESBuild, which also inlines all of the user functions) into a worker that handles requests. The resulting bundled worker is the artifact we'll eventually deploy as a stage in a Pages deployment's pipeline, and it is responsible for routing incoming requests through a series of function handlers as specified by the routes array.

Each route config can specify a `middleware` array and a `module` array. At runtime, an incoming request is mapped to a series of functions according to the route config. First the `middleware` of any _partially matching_ route configs are executed in the order they are defined. Then, one more pass is made through the routes to find the first exact route match with a `module` array specified (if any) which are then executed in order. Finally, if no previous function has returned a response, the request is passed along to be fulfilled by the asset server worker (via a fetcher binding). This is implemented via generator which yields the next function in the series. Each function in the series is given a `context.next()` function that will receive the next function in the series from that generator and then invoke it with the respective arguments.

It's important to note that though this ordering of functions is guaranteed, it's still up to each user function whether or not to invoke the next function in the series via `await context.next()`. It's entirely possible that the first function in the series will decide to return a response, leaving the remaining functions in the series unexecuted.

## Filepath-based routing

If you run pages functions compiler without passing a `-c <configPath>` argument, it will assume you want the routes to be inferred from the file tree. It will then proceed to search each file in the tree for any exported modules matching `onRequestGet` `onRequestPost` `onRequestPut` `onRequestPatch` `onRequestDelete` `onRequestHead` `onRequestOptions` or just plain `onRequest`. It will map the HTTP method accordingly, along with using the filepath as route path with file/folder names of the pattern `[someParam]` transformed to the route pattern `:someParam` (and `[[wildcardPath]]` to `:wildcardPath*`).
