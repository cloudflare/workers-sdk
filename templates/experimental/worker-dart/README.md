# Dart hello world for Cloudflare Workers

Your [Dart](https://dart.dev/) code in [index.dart](https://github.com/cloudflare/dart-worker-hello-world/blob/master/index.dart), running on Cloudflare Workers

In addition to [Wrangler](https://github.com/cloudflare/wrangler) you will need to [install Dart](https://dart.dev/get-dart).

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worker-dart --no-delegate-c3
# or
$ yarn create cloudflare my-project worker-dart --no-delegate-c3
# or
$ pnpm create cloudflare my-project worker-dart --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

Further documentation for Wrangler can be found [here](https://developers.cloudflare.com/workers/tooling/wrangler).

## Dart

After installing Dart per the linked instructions above,

```sh
cd projectname
```

Then run the following to get dependencies:

```sh
pub get

dart2js -O2 --server-mode -o index.js index.dart
```

That will compile your code into index.js, after which you can run `wrangler deploy` to push it to Cloudflare.

For more information on how Dart translates to JavaScript, see the [docs for dart2js](https://dart.dev/tools/dart2js) and the [interop guide](https://dart.dev/web/js-interop).

## Errors

Dart `2.13.0` and above require the `dart2js --server-mode` flag when using native JavaScript classes. Server mode is used to compile JS to run on server side VMs such as nodejs. If this flag is not used, the following errors are displayed:

```sh
index.dart:4:7:
Error: JS interop class 'Request' conflicts with natively supported class '_Request' in 'dart:html'.
class Request {
      ^
index.dart:8:7:
Error: JS interop class 'Response' conflicts with natively supported class '_Response' in 'dart:html'.
class Response {
      ^
index.dart:13:7:
Error: JS interop class 'FetchEvent' conflicts with natively supported class 'FetchEvent' in 'dart:html'.
class FetchEvent {
      ^
Error: Compilation failed.
```
