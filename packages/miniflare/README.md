# 🔥 Miniflare

**Miniflare 3** is a simulator for developing and testing
[**Cloudflare Workers**](https://workers.cloudflare.com/), powered by
[`workerd`](https://github.com/cloudflare/workerd).

> :warning: Miniflare 3 is API-only, and does not expose a CLI. Use Wrangler
> with `wrangler dev --experimental-local` to develop your Workers locally with
> Miniflare 3.

## Quick Start

```shell
$ npm install @miniflare/tre --save-dev
```

```js
import { Miniflare } from "@miniflare/tre";

// Create a new Miniflare instance, starting a workerd server
const mf = new Miniflare({
	script: `addEventListener("fetch", (event) => {
    event.respondWith(new Response("Hello Miniflare!"));
  })`,
});

// Send a request to the workerd server, the host is ignored
const response = await mf.dispatchFetch("http://localhost:8787/");
console.log(await response.text()); // Hello Miniflare!

// Cleanup Miniflare, shutting down the workerd server
await mf.dispose();
```

## API

> :warning: Features marked **(Experimental)** may change at any point and are
> not subject to semantic versioning guarantees.

### `type Awaitable<T>`

`T | Promise<T>`

Represents a value that can be `await`ed. Used in callback types to allow
`Promise`s to be returned if necessary.

### `type Json`

`string | number | boolean | null | Record<string, Json> | Json[]`

Represents a JSON-serialisable value.

### `type ModuleRuleType`

`"ESModule" | "CommonJS" | "Text" | "Data" | "CompiledWasm"`

Represents how a module's contents should be interpreted.

- `"ESModule"`: interpret as
  [ECMAScript module](https://tc39.es/ecma262/#sec-modules)
- `"CommonJS"`: interpret as
  [CommonJS module](https://nodejs.org/api/modules.html#modules-commonjs-modules)
- `"Text"`: interpret as UTF8-encoded data, expose in runtime with
  `string`-typed `default` export
- `"Data"`: interpret as arbitrary binary data, expose in runtime with
  `ArrayBuffer`-typed `default` export
- `"CompiledWasm"`: interpret as binary WebAssembly module data, expose in
  runtime with `WebAssembly.Module`-typed `default` export

### `interface ModuleDefinition`

Represents a manually defined module.

- `type: ModuleRuleType`

  How this module's contents should be interpreted.

- `path: string`

  Path of this module. The module's "name" will be obtained by converting this
  to a relative path. The original path will be used to read `contents` if it's
  omitted.

- `contents?: string | Uint8Array`

  Contents override for this module. Binary data should be passed as
  `Uint8Array`s. If omitted, will be read from `path`.

### `interface ModuleRule`

Represents a rule for identifying the `ModuleRuleType` of automatically located
modules.

- `type: ModuleRuleType`

  How to interpret modules that match the `include` patterns.

- `include: string[]`

  Glob patterns to match located module paths against (e.g. `["**/*.txt"]`).

- `fallthrough?: boolean`

  If `true`, ignore any further rules of this `type`. This is useful for
  disabling the built-in `ESModule` and `CommonJS` rules that match `*.mjs` and
  `*.js`/`*.cjs` files respectively.

### `type Persistence`

`boolean | string | undefined`

Represents where data should be persisted, if anywhere.

- If this is `undefined` or `false`, data will be stored in-memory and only
  persist between `Miniflare#setOptions()` calls, not restarts nor
  `new Miniflare` instances.
- If this is `true`, data will be stored on the file-system, in the `$PWD/.mf`
  directory.
- If this looks like a URL, then:
  - If the protocol is `memory:`, data will be stored in-memory as above.
  - If the protocol is `file:`, data will be stored on the file-system, in the
    specified directory (e.g. `file:///path/to/directory`). If the `unsanitise`
    search parameter is `true`, path sanitisation will be disabled.
  - If the protocol is `sqlite:`, data will be stored in an SQLite database, at
    the specified path (e.g. `sqlite:///path/to/db.sqlite`).
  - **(Experimental)** If the protocol is `remote:`, data will be read/written
    from/to real data stores on the Cloudflare network. By default, this will
    cache data in-memory, but the `cache` search parameter can be set to a
    URL-encoded persistence string to customise this. Note, this feature is only
    supported for KV namespaces at the moment, and requires the
    `cloudflareFetch` option to be set.
- Otherwise, if this is just a regular `string`, data will be stored on the
  file-system, using the value as the directory path.

### `enum LogLevel`

`NONE, ERROR, WARN, INFO, DEBUG, VERBOSE`

Controls which messages Miniflare logs. All messages at or below the selected
level will be logged.

### `interface LogOptions`

- `prefix?: string`

  String to add before the level prefix when logging messages. Defaults to `mf`.

- `suffix?: string`

  String to add after the level prefix when logging messages.

### `class Log`

- `constructor(level?: LogLevel, opts?: LogOptions)`

  Creates a new logger that logs all messages at or below the specified level to
  the `console`.

- `error(message: Error)`

  Logs a message at the `ERROR` level. If the constructed log `level` is less
  than `ERROR`, `throw`s the `message` instead.

- `warn(message: string)`

  Logs a message at the `WARN` level.

- `info(message: string)`

  Logs a message at the `INFO` level.

- `debug(message: string)`

  Logs a message at the `DEBUG` level.

- `verbose(message: string)`

  Logs a message at the `VERBOSE` level.

### `class NoOpLog extends Log`

- `constructor()`

  Creates a new logger that logs nothing to the `console`, and always `throw`s
  `message`s logged at the `ERROR` level.

### `interface WorkerOptions`

Options for an individual Worker/"nanoservice". All bindings are accessible on
the global scope in service-worker format Workers, or via the 2nd `env`
parameter in module format Workers.

#### Core

- `name?: string`

  Unique name for this worker. Only required if multiple `workers` are
  specified.

- `script?: string`

  JavaScript code for this worker. If this is a service worker format Worker, it
  must not have any imports. If this is a modules format Worker, it must not
  have any _npm_ imports, and `modules: true` must be set. If it does have
  imports, `scriptPath` must also be set so Miniflare knows where to resolve
  them relative to.

- `scriptPath?: string`

  Path of JavaScript entrypoint. If this is a service worker format Worker, it
  must not have any imports. If this is a modules format Worker, it must not
  have any _npm_ imports, and `modules: true` must be set.

- `modules?: boolean | ModuleDefinition[]`

  - If `true`, Miniflare will treat `script`/`scriptPath` as an ES Module and
    automatically locate transitive module dependencies according to
    `modulesRules`. Note that automatic location is not perfect: if the
    specifier to a dynamic `import()` or `require()` is not a string literal, an
    exception will be thrown.

  - If set to an array, modules can be defined manually. Transitive dependencies
    must also be defined. Note the first module must be the entrypoint and have
    type `"ESModule"`.

- `modulesRoot?: string`

  If `modules` is set to an array, modules' "name"s will be their `path`s
  relative to this value. This ensures file paths in stack traces are correct.

<!-- prettier-ignore-start -->
<!-- (for disabling `;` insertion in `js` code block) -->

- `modulesRules?: ModuleRule[]`

  Rules for identifying the `ModuleRuleType` of automatically located modules
  when `modules: true` is set. Note the following default rules are always
  included at the end:

  ```js
  [
    { type: "ESModule", include: ["**/*.mjs"] },
    { type: "CommonJS", include: ["**/*.js", "**/*.cjs"] },
  ]
  ```

  > If `script` and `scriptPath` are set, and `modules` is set to an array,
  > `modules` takes priority for a Worker's code, followed by `script`, then
  > `scriptPath`.

<!-- prettier-ignore-end -->

- `compatibilityDate?: string`

  [Compatibility date](https://developers.cloudflare.com/workers/platform/compatibility-dates/)
  to use for this Worker. Defaults to a date far in the past.

- `compatibilityFlags?: string[]`

  [Compatibility flags](https://developers.cloudflare.com/workers/platform/compatibility-dates/)
  to use for this Worker.

- `bindings?: Record<string, Json>`

  Record mapping binding name to arbitrary JSON-serialisable values to inject as
  bindings into this Worker.

- `wasmBindings?: Record<string, string>`

  Record mapping binding name to paths containing binary WebAssembly module data
  to inject as `WebAssembly.Module` bindings into this Worker.

- `textBlobBindings?: Record<string, string>`

  Record mapping binding name to paths containing UTF8-encoded data to inject as
  `string` bindings into this Worker.

- `dataBlobBindings?: Record<string, string>`

  Record mapping binding name to paths containing arbitrary binary data to
  inject as `ArrayBuffer` bindings into this Worker.

- `serviceBindings?: Record<string, string | { network: Network } | { external: ExternalServer } | { disk: DiskDirectory } | (request: Request) => Awaitable<Response>>`

  Record mapping binding name to service designators to inject as
  `{ fetch: typeof fetch }`
  [service bindings](https://developers.cloudflare.com/workers/platform/bindings/about-service-bindings/)
  into this Worker.

  - If the designator is a `string`, requests will be dispatched to the Worker
    with that `name`.
  - If the designator is an object of the form `{ network: { ... } }`, where
    `network` is a
    [`workerd` `Network` struct](https://github.com/cloudflare/workerd/blob/bdbd6075c7c53948050c52d22f2dfa37bf376253/src/workerd/server/workerd.capnp#L555-L598),
    requests will be dispatched according to the `fetch`ed URL.
  - If the designator is an object of the form `{ external: { ... } }` where
    `external` is a
    [`workerd` `ExternalServer` struct](https://github.com/cloudflare/workerd/blob/bdbd6075c7c53948050c52d22f2dfa37bf376253/src/workerd/server/workerd.capnp#L504-L553),
    requests will be dispatched to the specified remote server.
  - If the designator is an object of the form `{ disk: { ... } }` where `disk`
    is a
    [`workerd` `DiskDirectory` struct](https://github.com/cloudflare/workerd/blob/bdbd6075c7c53948050c52d22f2dfa37bf376253/src/workerd/server/workerd.capnp#L600-L643),
    requests will be dispatched to an HTTP service backed by an on-disk
    directory.
  - If the designator is a function, requests will be dispatched to your custom
    handler. This allows you to access data and functions defined in Node.js
    from your Worker.

#### Cache

- `cache?: boolean`

  If `false`, default and named caches will be disabled. The Cache API will
  still be available, it just won't cache anything.

- `cacheWarnUsage?: boolean`

  If `true`, the first use of the Cache API will log a warning stating that the
  Cache API is unsupported on `workers.dev` subdomains.

#### Durable Objects

- `durableObjects?: Record<string, string | { className: string, scriptName?: string }>`

  Record mapping binding name to Durable Object class designators to inject as
  `DurableObjectNamespace` bindings into this Worker.

  - If the designator is a `string`, it should be the name of a `class` exported
    by this Worker.
  - If the designator is an object, and `scriptName` is `undefined`, `className`
    should be the name of a `class` exported by this Worker.
  - Otherwise, `className` should be the name of a `class` exported by the
    Worker with a `name` of `scriptName`.

#### KV

- `kvNamespaces?: Record<string, string> | string[]`

  Record mapping binding name to KV namespace IDs to inject as `KVNamespace`
  bindings into this Worker. Different Workers may bind to the same namespace ID
  with different binding names. If a `string[]` of binding names is specified,
  the binding name and KV namespace ID are assumed to be the same.

- `sitePath?: string`

  Path to serve Workers Sites files from. If set, `__STATIC_CONTENT` and
  `__STATIC_CONTENT_MANIFEST` bindings will be injected into this Worker. In
  modules mode, `__STATIC_CONTENT_MANIFEST` will also be exposed as a module
  with a `string`-typed `default` export, containing the JSON-stringified
  manifest. Note Workers Sites files are never cached in Miniflare.

- `siteInclude?: string[]`

  If set, only files with paths matching these glob patterns will be served.

- `siteExclude?: string[]`

  If set, only files with paths _not_ matching these glob patterns will be
  served.

#### R2

- `r2Buckets?: Record<string, string> | string[]`

  Record mapping binding name to R2 bucket names to inject as `R2Bucket`
  bindings into this Worker. Different Workers may bind to the same bucket name
  with different binding names. If a `string[]` of binding names is specified,
  the binding name and bucket name are assumed to be the same.

#### D1, Analytics Engine and Queues

_Not yet supported_

### `interface SharedOptions`

Options shared between all Workers/"nanoservices".

#### Core

- `host?: string`

  Hostname that the `workerd` server should listen on. Defaults to `127.0.0.1`.

- `port?: number`

  Port that the `workerd` server should listen on. Tries to default to `8787`,
  but falls back to a random free port if this is in use. Note if a manually
  specified port is in use, Miniflare throws an error, rather than attempting to
  find a free port.

- `inspectorPort?: number`

  Port that `workerd` should start a DevTools inspector server on. Visit
  `chrome://inspect` in a Chromium-based browser to connect to this. This can be
  used to see detailed `console.log`s, profile CPU usage, and will eventually
  allow step-through debugging.

- `verbose?: boolean`

  Enable `workerd`'s `--verbose` flag for verbose logging. This can be used to
  see simplified `console.log`s.

- `log?: Log`

  Logger implementation for Miniflare's errors, warnings and informative
  messages.

- `cf?: boolean | string | Record<string, any>`

  Controls the object returned from incoming `Request`'s `cf` property.

  - If set to a falsy value, an object with default placeholder values will be
    used
  - If set to an object, that object will be used
  - If set to `true`, a real `cf` object will be fetched from a trusted
    Cloudflare endpoint and cached in `node_modules/.mf` for 30 days
  - If set to a `string`, a real `cf` object will be fetched and cached at the
    provided path for 30 days

- `liveReload?: boolean`

  If `true`, Miniflare will inject a script into HTML responses that
  automatically reloads the page in-browser whenever the Miniflare instance's
  options are updated.

- **(Experimental)**
  `cloudflareFetch?: (resource: string, searchParams?: URLSearchParams, init?: RequestInit) => Awaitable<Response>`

  Authenticated `fetch` used by `remote:` storage to communicate with the
  Cloudflare API. `https://api.cloudflare.com/client/v4/accounts/<account_id>/`
  should be prepended to `resource` to form the request URL. Appropriate
  authorization headers should also be added.

<!--TODO: implement custom logger-->

#### Cache, Durable Objects, KV and R2

- `cachePersist?: Persistence`

  Where to persist data cached in default or named caches. See docs for
  `Persistence`.

- `durableObjectsPersist?: Persistence`

  _Not yet supported_, Miniflare will throw if this is truthy and Durable Object
  bindings are specified.

- `kvPersist?: Persistence`

  Where to persist data stored in KV namespaces. See docs for `Persistence`.

- `r2Persist?: Persistence`

  Where to persist data stored in R2 buckets. See docs for `Persistence`.

#### D1, Analytics Engine and Queues

_Not yet supported_

### `type MiniflareOptions`

`SharedOptions & (WorkerOptions | workers: WorkerOptions[]))`

Miniflare accepts either a single Worker configuration or multiple Worker
configurations in the `workers` array. When specifying an array of Workers, the
first Worker is designated the entrypoint and will receive all incoming HTTP
requests. Some options are shared between all workers and should always be
defined at the top-level.

### `class Miniflare`

- `constructor(opts: MiniflareOptions)`

  Creates a Miniflare instance and starts a new `workerd` server. Note unlike
  Miniflare 2, Miniflare 3 _always_ starts a HTTP server listening on the
  configured `host` and `port`: there are no `createServer`/`startServer`
  functions.

- `setOptions(opts: MiniflareOptions)`

  Updates the configuration for this Miniflare instance and restarts the
  `workerd` server. Note unlike Miniflare 2, this does _not_ merge the new
  configuration with the old configuration.

- `ready: Promise<URL>`

  Returns a `Promise` that resolves with a `http` `URL` to the `workerd` server
  once it has started and is able to accept requests.

- `dispatchFetch(input: RequestInfo, init?: RequestInit): Promise<Response>`

  Sends a HTTP request to the `workerd` server, dispatching a `fetch` event in
  the entrypoint Worker. Returns a `Promise` that resolves with the response.
  Note that this implicitly waits for the `ready` `Promise` to resolve, there's
  no need to do that yourself first. Additionally, the host of the request's URL
  is always ignored and replaced with the `workerd` server's.

- `dispose(): Promise<void>`

  Cleans up the Miniflare instance, and shuts down the `workerd` server. Note
  that after this is called, `setOptions` and `dispatchFetch` cannot be called.
