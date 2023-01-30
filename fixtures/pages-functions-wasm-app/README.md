# ⚡️ pages-functions-wasm-app

`pages-functions-wasm-app` is a test fixture that sets up a ⚡️Pages project with [Functions](https://developers.cloudflare.com/pages/platform/functions) and [`wasm` module imports](https://blog.cloudflare.com/workers-javascript-modules/)

## Dev

```bash
# cd into the test fixture folder
cd fixtures/pages-functions-wasm-app

# start dev server
npm run dev
```

## Publish

> Please note that in order to deploy this project to `.pages.dev` you need to have a [Cloudflare account](https://dash.cloudflare.com/login)

```bash
# cd into the test fixture folder
cd fixtures/pages-functions-wasm-app

# Deploy the directory of static assets as a Pages deployment
npm run publish
```

If deployment was successful, follow the URL refrenced in the success message in your terminal

```
✨ Deployment complete! Take a peek over at https:/<hash>.<PROJECT_NAME>.pages.dev
```

## Run tests

```bash
# cd into the test fixture folder
cd fixtures/pages-functions-wasm-app

# Run tests
npm run test
```
