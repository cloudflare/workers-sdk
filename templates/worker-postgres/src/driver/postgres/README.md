This directory contains the source for the original bundled driver as well as artifacts created by `edgeworkerizer.py` to enable it to run on Cloudflare Workers.

### Bundle Deno PostgreSQL driver

```sh
deno bundle https://deno.land/x/postgres@v0.13.0/mod.ts > postgres.js.deno
python3 edgeworkerizer.py postgres.js.deno > index.js
cp *.wasm ../../../dist/
```
