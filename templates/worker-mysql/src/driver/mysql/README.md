This directory contains the source for the original bundled driver as well as artifacts created by
`edgeworkerizer.py` to enable it to run on Cloudflare Workers.

### Bundle Deno MySQL driver

```sh
deno bundle https://deno.land/x/mysql@v2.10.1/mod.ts > mysql.js.deno
python3 ../edgeworkerizer.py mysql.js.deno > index.js
cp *.wasm ../../../dist/
```
