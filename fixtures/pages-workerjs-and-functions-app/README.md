# ⚡️ pages-workerjs-and-functions-app

`pages-workerjs-and-functions-app` is a test fixture that sets up an [Advanced Mode](https://developers.cloudflare.com/pages/platform/functions/#advanced-mode) ⚡️Pages project that also includes a `/functions` directory. This fixture is meant to test that for such projects, the single worker script provided by users will
always take precedence over the `functions` directory.

## Publish

> Please note that in order to deploy this project to `.pages.dev` you need to have a [Cloudflare account](https://dash.cloudflare.com/login)

```bash
# cd into the test fixture folder
cd fixtures/pages-workerjs-and-functions-app

# Deploy the directory of static assets as a Pages deployment
npx wrangler pages publish public
```

If deployment was successful, follow the URL refrenced in the success message in your terminal

```
✨ Deployment complete! Take a peek over at https:/<hash>.<PROJECT_NAME>.pages.dev
```

## Run tests

```bash
# cd into the test fixture folder
cd fixtures/pages-workerjs-and-functions-app

# Run tests
npm run test
```
