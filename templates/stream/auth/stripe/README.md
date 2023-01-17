# Cloudflare Stream + Stripe

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/stream/auth/stripe)

Host and monetize **paid** video content (live or on-demand) that you fully control, on your own website, using [Cloudflare Stream](https://www.cloudflare.com/products/cloudflare-stream/), [Cloudflare Pages](https://pages.cloudflare.com/), and [Stripe Checkout](https://stripe.com/payments/checkout).

Inspired by Stripe Checkout's [examples](https://github.com/stripe-samples/checkout-one-time-payments), and adapted for Cloudflare Workers.

## Prerequisites

### Setup Stripe

1. Install the Stripe CLI (`brew install stripe/stripe-cli/stripe`)
2. Create a Stripe account, add a name to the connected business
3. Copy the test publishable key from the Stripe Dashboard, and add it to `wrangler.toml` as `STRIPE_PUBLISHABLE_KEY`
4. Copy the test secret key from the Stripe Dashboard, and add it to `wrangler.toml` as `STRIPE_SECRET_KEY`
5. Create a price using the Stripe CLI. For example, the following command creates a new product, called `demo`, with a price of $5. `stripe prices create --unit-amount 500 --currency usd -d "product_data[name]=demo"`.
6. Copy the `id` of the price you just generated, and add it to `wrangler.toml` as `PRICE`.

### Setup Cloudflare Stream

1. Create a Cloudflare account, start a subscription to Cloudflare Stream.
2. Copy your Cloudflare account ID, and add it to `wrangler.toml` as `CLOUDFLARE_ACCOUNT_ID`
3. Create a Cloudflare API token with permissions to Stream, and add it to `wrangler.toml` as `CLOUDFLARE_API_TOKEN`
4. [Upload a video](https://developers.cloudflare.com/stream/uploading-videos/) to Cloudflare Stream, and copy its UID, and add it to `wrangler.toml` as `CLOUDFLARE_STREAM_VIDEO_UID`

## Run locally

`npm run dev`

## Test locally

Test the checkout flow by adding payment details (using the [Stripe test cards](https://stripe.com/docs/testing), while in development) — once payment succeeds, you will be redirected to `/watch`. This page is authenticated — only those who have paid are granted an access token ([signed URL](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/)) to view the video.
