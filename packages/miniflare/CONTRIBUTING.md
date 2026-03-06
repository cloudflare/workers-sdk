# Contributing Guide

## How does Miniflare work at a high level?

Before going further, ensure you're familiar with
[`workerd`'s configuration format](https://github.com/cloudflare/workerd/blob/main/src/workerd/server/workerd.capnp).
The configuration schema has comprehensive inline documentation and will help
you understand how everything fits together.

Each `new Miniflare()` instance corresponds to a running `workerd` process.
Calling `Miniflare#setOptions()` will restart the `workerd` process with new
configuration (note `workerd` doesn't support hot reloading of configuration
yet). Calling `Miniflare'dispose()` will shut down the `workerd` process.

Miniflare is composed of a set of plugins (Miniflare 2 used to multiple
packages, and these plugins and Miniflare's API are a pullover from that). Each
plugin contributes services and bindings for user Workers. The diagram below
maps out how sockets and services all link together.

Each `new Miniflare()` instance starts a Node.js "loopback" server for logging,
source mapping/prettifying errors, and calling function-valued
`serviceBindings`. The `loopback` external service sends all requests to this
service.

> **Aside:** bindings used to be implemented in Node.js with the loopback server
> used for receiving calls to bindings. We switched to implementing bindings in
> Workers for a few reasons:
>
> - Removing native dependency on SQLite to speed up installs
> - Supporting running `workerd` standalone, and compiling single-file
>   executables with binding simulators using `workerd compile`
> - Allowing more code sharing between the real production implementations and
>   simulators
>
> Refer to https://github.com/cloudflare/miniflare/pull/656 for more details.

The general pattern for bindings to have a Worker exporting a Durable Object
that extends `MiniflareDurableObject` (provides storage and logging utilities),
then multiple "object entry" Workers that have a `namespace` binding, and
forward all incoming requests to the Durable Object using
`idFromName(namespace)` as the ID.

Miniflare always creates an `entry` socket bound to the `core:entry` Worker, but
may create an `entry:local` socket if the configured `host` doesn't permit
access over the local loopback address. Miniflare also supports opening sockets
directly to user Workers (`core:user:*`) using the `unsafeDirectSockets` option.
Wrangler uses this option to listen on the well-known inspector port for its
inspector proxy service. Cross-worker RPC between `wrangler dev` sessions is
handled via workerd's native debug port instead.

![Miniflare Services Architecture](./miniflare.drawio.svg)

_(created with [draw.io](https://www.drawio.com/), the `.svg` file contains an
embedded copy of the diagram allowing you to edit it by opening the `.svg`
file)_

## How do I add local support for a new binding?

Support for a binding in Miniflare is made up of:

- A "simulator" worker containing a Durable Object that runs in workerd
- A Miniflare “plugin” that defines configuration and converts that
  configuration into the required services and bindings for the user worker
- Optionally, some APIs on the `Miniflare` class for interacting with the
  simulator in Node.js

### Step 1: implement the simulator

If your binding is a wrapped binding with its API implemented in
`workerd/src/cloudflare`, skip this step.

- Create a new worker in [`src/workers`](./src/workers).
- Export a Durable Object extending `MiniflareDurableObject` from the
  `miniflare:shared` module. This module is automatically provided by a
  `workerd` extension to Miniflare's internal Workers.
- Use `@GET`, `@POST`, ... decorators from `miniflare:shared` to define API
  routes.
- Use the `db: TypedSql` and `blob: BlobStore` properties from
  `MiniflareDurableObject` to access an SQLite database and blob store for this
  object instance. Refer to
  [`src/workers/shared/sql.worker.ts`](./src/workers/shared/sql.worker.ts) for
  `TypedSql`'s types, and
  [`src/workers/shared/blob.worker.ts`](./src/workers/shared/blob.worker.ts) for
  `BlobStore`'s.
- Use the `name: string` property to access the namespace/ID of the object
  instance.

### Step 2: define a plugin with options

- Create a new plugin in [`src/plugins`](./src/plugins) by copying one of
  existing plugins. [`src/plugins/r2/index.ts`](./src/plugins/r2/index.ts) is a
  good one to start from.
- Each plugin defines [Zod](https://github.com/colinhacks/zod) schemas for
  `options` and `sharedOptions`. `options` become part of `WorkerOptions` type
  whereas `sharedOptions` become part of the `SharedOptions` type. Recall the
  type of `MiniflareOptions` passed to the `new Miniflare()` constructor is
  `SharedOptions & (WorkerOptions | { workers: WorkerOptions[] })`. Essentially,
  `options` should contain per-worker configuration (e.g. mapping binding names
  to namespaces, `kvNamespaces`, etc.), whereas `sharedOptions` should contain
  per-instance configuration (e.g. where to store binding data, `kvPersist`,
  etc.).
- Options should be documented in [`README.md`](./README.md).

### Step 3: implement `getBindings()`

- This hook is called for each configured worker, and accepts parsed `options`,
  and returns `Worker_Binding`s that will be injected into the user Worker.
  Refer to
  [`struct Binding` in `workerd.capnp`](https://github.com/cloudflare/workerd/blob/2ea29ab934c3a07f8fb2174ce3869d98e13d3515/src/workerd/server/workerd.capnp#L292)
  for possible values here.
- If your code doesn't type check, it's possible you'll need to update
  Miniflare's `workerd.capnp` TypeScript definitions. Copy the new
  `worker.capnp` to
  [`src/runtime/config/workerd.capnp`](./src/runtime/config/workerd.capnp), run
  `pnpm -F miniflare capnp:workerd`, then update the handwritten types in
  [`src/runtime/config/workerd.ts`](./src/runtime/config/workerd.ts) to match
  the newly generated methods. The `encodeCapnpStruct()` method in
  [`src/runtime/config/index.ts`](./src/runtime/config/index.ts) maps between
  plain-JavaScript-objects, and Cap'n Proto encoded structs.

### Step 4: implement `getNodeBindings()`

- This hook accepts parsed `options`, and returns a `Record<string, unknown>`
  that will be merged with other plugins' to form the return of
  `Miniflare#getBindings()`.
- The special `kProxyNodeBinding` value can be used to indicate Miniflare should
  use its magic proxy to proxy calls to the actual `workerd` binding.

### Step 5: implement `getServices()`

- This hook is called for each configured worker, and accepts parsed `options`
  and `sharedOptions`, and returns `Service`s that will be added to the
  `workerd` process. Refer to
  [`struct Service` in `workerd.capnp`](https://github.com/cloudflare/workerd/blob/2ea29ab934c3a07f8fb2174ce3869d98e13d3515/src/workerd/server/workerd.capnp#L135)
  for possible values here.
- Services returned are globally de-duped by name.

### Step 6: register your plugin

- Import your plugin in [`src/plugins/index.ts`](./src/plugins/index.ts).
- Add it to `PLUGINS` and `WorkerOptions`.
- Add it to `SharedOptions` if it defines `sharedOptions`.

### Step 7: implement additional `Miniflare` APIs

- You may want to implement an API like `Miniflare#getKVNamespace()` to expose
  your binding in Node.js via Miniflare's magic proxy.
- Refer to the implementation of existing APIs for how to do this.
- Note the `ReplaceWorkersTypes` type replaces Workers `Request`, `Response`,
  `ReadableStream`, `Headers`, `Blob`, and `AbortSignal` with their Node.js
  equivalents.

## How do Miniflare's existing bindings work?

### KV

#### Schema

The KV simulator uses Miniflare's `KeyValueStorage` expiring-key-value-metadata
storage abstraction. This uses the following SQL schema:

```sql
-- Key/value entry
CREATE TABLE IF NOT EXISTS _mf_entries (
  key TEXT PRIMARY KEY,
  blob_id TEXT NOT NULL,  -- Blob ID stored in `BlobStore`
  expiration INTEGER,     -- Milliseconds since unix epoch
  metadata TEXT           -- JSON encoded metadata blob
);
```

#### Routes

- **`GET /:key[?cache_ttl=<seconds>]`:**
  - 200 response: value as body, `CF-Expiration` response header is expiration
    in seconds since unix epoch if defined, `CF-KV-Metadata` response header is
    JSON-encoded metadata if defined
  - 400 response: invalid key or `cache_ttl`
  - 404 response: key not found
  - 414 response: key too long
- **`PUT /:key[?expiration=<seconds>][&expiration_ttl=<seconds>]`:**
  - `CF-KV-Metadata` request header is JSON-encoded metadata if defined
  - Request body is value to store
  - 200 response: empty body if stored
  - 400 response: invalid key or expiration
  - 413 response: body too large
  - 414 response: key too long
- **`DELETE /:key`:**
  - 200 response: empty body if deleted
  - 400 response: invalid key
  - 414 response: key too long
- **`GET /[?key_count_limit=<limit>][&prefix=<prefix>][&curosr=<cursor>]`:**
  - 200 response: JSON-encoded body with type
    [`KVNamespaceListResult`](https://workers-types.pages.dev/#KVNamespaceListResult)
  - 400 response: invalid options

### Cache

#### Schema

The Cache simulator also uses Miniflare's `KeyValueStorage` abstraction, so the
schema is the same as KV.

#### Routes

- **`GET *`:**
  - Cache key is either `request.cf.cacheKey` if defined or `req.url`
  - 200 response: cached response, with `CF-Cache-Status: HIT` response header
  - 206 response: partial content, with `CF-Cache-Status: HIT` response header
  - 416 response: range not satisfiable
  - 504 response: cache miss
- **`PUT *`:**
  - Cache key is either `request.cf.cacheKey` if defined or `req.url`
  - Request body is a serialised
    [HTTP/1.1 response](https://developer.mozilla.org/en-US/docs/Web/HTTP/Messages#http_responses)
  - 204 response: empty body if stored
  - 413 response: not cacheable
- **`PURGE: *`:**
  - Cache key is either `request.cf.cacheKey` if defined or `req.url`
  - 200 response: empty body if deleted
  - 404 response: key not found

### R2

#### Schema

```sql
-- Object in R2 bucket. Multipart objects are composed of multiple parts,
-- and are only added to this table once completed.
CREATE TABLE IF NOT EXISTS _mf_objects (
  key TEXT PRIMARY KEY,
  blob_id TEXT,                    -- null if multipart
  version TEXT NOT NULL,
  size INTEGER NOT NULL,           -- total size of object (all parts) in bytes
  etag TEXT NOT NULL,              -- hex MD5 hash if not multipart
  uploaded INTEGER NOT NULL,       -- milliseconds since unix epoch
  checksums TEXT NOT NULL,         -- JSON-serialised `R2StringChecksums` (workers-types)
  http_metadata TEXT NOT NULL,     -- JSON-serialised `R2HTTPMetadata` (workers-types)
  custom_metadata TEXT NOT NULL    -- JSON-serialised user-defined metadata
);

-- In-progress, completed, or aborted multipart upload. Stores current state,
-- and metadata passed to `createMultipartUpload()`.
CREATE TABLE IF NOT EXISTS _mf_multipart_uploads (
  upload_id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  http_metadata TEXT NOT NULL,     -- JSON-serialised `R2HTTPMetadata` (workers-types)
  custom_metadata TEXT NOT NULL,   -- JSON-serialised user-defined metadata
  state TINYINT DEFAULT 0 NOT NULL -- 0 = IN_PROGRES, 1 = COMPLETED, 2 = ABORTED
  -- NOTE: we need to keep completed/aborted uploads around for referential
  -- integrity, and because error messages are different when attempting to
  -- upload parts to them
);

-- Parts belonging to a multipart object/upload. Created when calling
-- `R2MultipartUpload#uploadPart()`.
CREATE TABLE IF NOT EXISTS _mf_multipart_parts (
  upload_id TEXT NOT NULL REFERENCES _mf_multipart_uploads(upload_id),
  part_number INTEGER NOT NULL,
  blob_id TEXT NOT NULL,
  size INTEGER NOT NULL,           -- NOTE: used to identify which parts to read for range requests
  etag TEXT NOT NULL,              -- NOTE: multipart part ETag's are not MD5 checksums
  checksum_md5 TEXT NOT NULL,      -- NOTE: used in construction of final object's ETag
  object_key TEXT REFERENCES _mf_objects(key) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (upload_id, part_number)
);
```

Refer to [`bucket.worker.ts`](./src/workers/r2/bucket.worker.ts) for more
details on the multipart implementation.

#### Routes

- **`GET /`:** _(any read)_
  - `CF-R2-Request` request header is JSON-encoded request, refer to
    `R2BindingRequestSchema`
  - 200 value response: JSON-encoded metadata concatenated with value,
    `CF-R2-Metadata-Size` response header is number of bytes in body for
    metadata before value
- **`PUT /`:** _(any write)_
  - `CF-R2-Metadata-Size` request header is number of bytes in body for metadata
    before value
  - Request body is JSON-encoded request (refer to `R2BindingRequestSchema`),
    followed by optional value
  - 200 empty response: empty body if deleted, or aborted multipart upload
  - 200 value response: JSON-encoded metadata concatenated with value,
    `CF-R2-Metadata-Size` response header is number of bytes in metadata before
    value

### D1

#### Routes

- **`POST /query`:**
- **`POST /execute`:**
  - Request body is JSON-encoded `D1Query` or `D1Query[]`
  - 200 response: JSON-encoded `D1SuccessResponse`

### Queues

#### Routes

- **`POST /message`:**
  - Optional `X-Msg-Fmt` request header is one of "text", "json", "bytes", or
    "v8" (defaults to "v8"), and instructs how to interpret the body
  - Optional `X-Msg-Delay-Sec` request header sets the number of seconds to
    delay the delivery of this message (value between `0` and `42300` inclusive)
  - Request body is encoded message body
  - 200 response: empty body if enqueued
  - 413 response: message too large
- **`POST /batch`:**
  - `CF-Queue-Batch-Count` request header is number of messages in batch
  - `CF-Queue-Largest-Msg` request header is size in bytes of largest message in
    batch
  - `CF-Queue-Batch-Bytes` request header is size in bytes of entire batch
  - Optional `X-Msg-Delay-Sec` request header sets the number of seconds to
    delay the delivery of this batch (value between `0` and `42300` inclusive)
  - Request body is JSON-encoded `{ messages: QueueIncomingMessage[] }`
  - 200 response: empty body if all messages enqueued
  - 413 response: batch or individual message too large

## How does Miniflare's storage system work?

Refer to https://github.com/cloudflare/miniflare/discussions/525. Cloudflare
employees can also refer to
https://docs.google.com/document/d/1q07Um6EB8SfbpyXzYRnu0EhtrV9WTGkWS1KyzUbKLpk/edit?usp=sharing
for more details. Bindings implemented as Durable Objects extend
`MiniflareDurableObject` which provides a `db` property for accessing a typed
SQLite database, and a `blobs` property for accessing a `BlobStore` as described
by the links above.

## How does Miniflare's magic proxy work?

Refer to the `High Level Implementation Overview` in
https://github.com/cloudflare/miniflare/pull/639.
