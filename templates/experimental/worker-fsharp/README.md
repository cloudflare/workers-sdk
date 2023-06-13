# FSharp/Fable 'Hello World' on Cloudflare Workers

This Repo shows how to run 'Hello World' in [FSharp](https://docs.microsoft.com/en-us/dotnet/fsharp/get-started/install-fsharp) on Cloudflare Workers via the [Fable](https://fable.io) JavaScript transpiler. Workers are a simple inexpensive way to execute functions on Cloudflare edge network. They can be used for anything from utilities to full-on WebAPI's. For a more detailed description of Workers in FSharp see:

- [Description of a FSharp 'Hello World' Worker](https://github.com/jbeeko/cfworker-hello-world)
- [Description of a FSharp WebAPI Worker](https://github.com/jbeeko/cfworker-web-api)

## Setting Up Your Environment

### Prerequisits

- A Cloudflare account, either [paid or free](https://dash.cloudflare.com/sign-up/workers). Needed to provide the hosting environment to which your worker will be deployed.
- [Wrangler](https://github.com/cloudflare/wrangler), the Cloudflare Workers CLI. This works with the webpack.config.js file to build and deploy your worker.
- [.NET SDK](https://dotnet.microsoft.com), used to generate an F# abstract syntax tree from which the JavaScript is generated.
- [Node.js](https://nodejs.org/en/), used to support the tooling to convert the AST to JavaScript.
- An editor with F# support. [VisualStudio Code with Ionide is recomended](https://docs.microsoft.com/en-us/dotnet/fsharp/get-started/install-fsharp#install-f-with-visual-studio-code).

### Install and Check Prerequisits

Perform the following as some simple checks to ensure the pre-requisits are in place. At time of writing the following were working:

- [Check](https://docs.microsoft.com/en-us/dotnet/fsharp/get-started/get-started-vscode) you are able to edit F# files.
- [Log into Cloudflare](https://dash.cloudflare.com/login), you should be able to view the workers pannel.
- `wrangler --version` -> v1.10.3
- `dotnet --version` -> .NET Core 3.1 or .Net 5.0
- `node -v` -> v12.18

### Configure Wrangler

To authenticate wrangler commands it is recomended you [configure wrangler](https://dash.cloudflare.com/sign-up/workers) with your APIKey using `wrangler config`.

## Generating and Testing a Worker

### Generate a New Project

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-fsharp --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-fsharp --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-fsharp --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

### Build and Deploy to Dev

1. Run `dotnet tool restore`
2. Run `dotnet fable watch src --outDir tmp --run wrangler dev`
   This will run Fable and `wrangler dev` both in watch mode. Fable compiles F# to JavaScript. Wrangler then pushes the new javascript to your accounts Cloudflare Dev environment and starts a stub running locally for testing. Cloudflare has a blog [explaining](https://blog.cloudflare.com/announcing-wrangler-dev-the-edge-on-localhost/) how this works.

### Test the Dev Worker:

```
MBPro:~ $ curl localhost:8787
Hello from Fable at: Mon Oct 19 2020 19:30:39 GMT+0000 (Coordinated Universal Time)
```

## Publish to Your Cloudflare Account

To publish your worker to your Cloudflare account first configure a [route and zone id](https://developers.cloudflare.com/workers/cli-wrangler/configuration) in your `./wrangler.toml` file. Then execute `wrangler deploy` this will deploy the worker javascript file as specified in the TOML file.

&nbsp;

> **Note to Contributors:** PRs are welcome. Test changes by:
>
> - Creating a new project from the template: `wrangler generate my-proj file://"path_to_local_repo`"
> - Building and deploying the worker from root of generated my-proj: `dotnet fable watch src --outDir tmp --run wrangler dev`
> - Testing the worker: `$ curl localhost:8787`
>
> `Hello from Fable at: Sun Nov 08 2020 17:41:19 GMT+0000 (Coordinated Universal Time)`
