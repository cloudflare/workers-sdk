# workers-with-assets-and-http-based-service-bindings

`workers-with-assets-and-http-based-service-bindings` is a test fixture that showcases [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) between a Worker and a [Worker with assets](https://developers.cloudflare.com/workers/static-assets/). This particular fixture sets up two Workers: `worker-A` (a regular Worker without assets), and `worker-B` (a Worker with assets), and configures `worker-A` with an [http-based service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/) to `worker-B`.

## dev

To start a dev session for each Worker individually, run:

```
cd workerA
wrangler dev
```

```
cd workerB
wrangler dev
```

## Run tests

```
npm run test:ci
```
