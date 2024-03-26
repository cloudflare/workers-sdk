# ⚡️ pages-functions-with-config-file-app

`pages-functions-with-config-file-app` is a test fixture that sets up a ⚡️Pages⚡️ Functions project, with a `wrangler.toml` [configuration file](hhttps://developers.cloudflare.com/workers/wrangler/configuration). The purpose of this fixture is to demonstrate that `wrangler pages dev` can take configuration from a `wrangler.toml` file.

## Local dev

To test this fixture run `wrangler pages dev` in the fixture folder:

```bash
# cd into the test fixture folder
cd fixtures/pages-functions-with-config-file-app

# Start local dev server
npx wrangler pages dev
```

Once the local dev server was started, you should see the configuration specified in the `wrangler.toml` at the root of the fixture folder, affect the generated Worker.

## Run tests

```bash
# cd into the test fixture folder
cd fixtures/pages-functions-with-config-file-app

# Run tests
npm run test
```

You can still override what is in the wrangler.toml by adding command line args: wrangler pages dev --binding=KEY:VALUE
