# ⚡️ pages-workerjs-with-config-file-app

`pages-workerjs-with-config-file-app` is a test fixture that sets up an [Advanced Mode](https://developers.cloudflare.com/pages/platform/functions/#advanced-mode) ⚡️Pages⚡️ project with a `wrangler.toml` [configuration file](hhttps://developers.cloudflare.com/workers/wrangler/configuration). he purpose of this fixture is to demonstrate that `wrangler pages dev` can take configuration from a `wrangler.toml` file.

## Local dev

To test this fixture run `wrangler pages dev` in the fixture folder:

```bash
# cd into the test fixture folder
cd fixtures/pages-workerjs-with-config-file-app

# Start local dev server
npx wrangler pages dev
```

Once the local dev server was started, you should see the configuration specified in the `wrangler.toml` at the root of the fixture folder, affect the generated Worker.

## Run tests

```bash
# cd into the test fixture folder
cd fixtures/pages-workerjs-with-config-file-app

# Run tests
npm run test
```
