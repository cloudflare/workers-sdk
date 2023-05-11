# Download Counter Durable Object

To maintain an accurate count of the number of downloads for each image, we're using Durable Objects. Each image has its own instance of the Durable Object class defined in [`./src/downloadCounter.js`](./src/downloadCounter.js). At present, wrangler v2 does not support Durable Objects, which is why this exists in its own little package. We'll update this repo when we can simplify the deployment process.

## Publish

```sh
npm install;
CF_ACCOUNT_ID="<YOUR CLOUDFLARE ACCOUNT ID>" npm run publish;
```
