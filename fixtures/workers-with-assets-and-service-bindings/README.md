# workers-with-assets-and-service-bindings

`workers-with-assets-and-service-bindings` is a test fixture that showcases [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) between a Worker and a [Worker with assets](https://developers.cloudflare.com/workers/static-assets/).

The fixture sets up multiple Workers:

- `worker-A` ➔ a regular Worker without assets
- `worker-B` ➔ a Worker with assets, that exports a default object

```
export default {
	async fetch() {}
}
```

- `worker-C` ➔ a Worker with assets, that exports a default entrypoint

```
export default class extends WorkerEntrypoint {
	async fetch(){}
}
```

- `worker-D` ➔ a Worker with assets, that exports a named entrypoint

```
export class EntrypointD extends WokrerEntrypoint {}
```

and configures service bindings between `worker-A` and all other Workers:

```
## workerA/wrangler.toml

# service binding to Worker that exports a default object
[[services]]
binding = "DEFAULT_EXPORT"
service = "worker-b"

# service binding to Worker that exports a default entrypoint
[[services]]
binding = "DEFAULT_ENTRYPOINT"
service = "worker-c"

# service binding to Worker that exports a named entrypoint
[[services]]
binding = "NAMED_ENTRYPOINT"
service = "worker-d"
entrypoint = "EntrypointD"
```

## dev

To start a dev session for each Worker individually, run:

```
cd <worker_directory>
wrangler dev
```

## Run tests

```
npm run test:ci
```
