# Forum application built with Pages Functions, Workers KV and Durable Objects

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/pages-example-forum-app)

## Overview

This example application showcases a forum application that allows authenticated users to leave comments, like comments and reply on other user’s comments using Pages Functions to handle server-side logic such as Authentication and posting comments to Workers KV. We will also use Workers KV for storage of our comment entries and Durable Objects to keep the count of likes consistent.

![Screen Recording 2022-08-02 at 01 43 51](https://user-images.githubusercontent.com/35943047/182391704-ef720814-8c05-45d1-9e30-ade7e9ce6e74.gif)

# Template: Pages-forum-example

This repo contains example code for a forum applications that uses the following:

- [React](https://create-react-app.dev/) with Typescript support and [Chakra UI](https://chakra-ui.com/) for the user interface.
- [Cloudflare Pages](https://developers.cloudflare.com/pages/platform/functions/) for deployment and Continuous integration, also [Pages Functions](https://developers.cloudflare.com/pages/platform/functions/) for hosting API functions.
- [Workers KV](https://developers.cloudflare.com/workers/runtime-apis/kv/) for storing comment entries.
- [Durable Objects](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/) for storing consistency of likes.
- [GitHub OAuth](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app) for authentication.

## Set up

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project pages-example-forum-app --no-delegate-c3
# or
$ yarn create cloudflare my-project pages-example-forum-app --no-delegate-c3
# or
$ pnpm create cloudflare my-project pages-example-forum-app --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

To run this locally, ensure you have `Wrangler` version `>=16.7.0` then run

```sh
npm install && npm run start
```

# Environment variables

Create a `.env` file and copy to contents of `.env.example` into the file. Then replace the credentials accordingly.

# React Component structure.

The componets can be found in `src/components`. The image below shows a breakd
own of how the components are used

<img width="1075" alt="Screenshot 2022-08-01 at 15 44 48" src="https://user-images.githubusercontent.com/35943047/182390650-a68cb25a-b8dc-48e5-ad4f-7c2bb4787849.png">

# Pages Functions

<img width="1143" alt="Screenshot 2022-08-01 at 10 43 09" src="https://user-images.githubusercontent.com/35943047/182391478-c0467eb2-21d2-4b00-9984-9fca389648e7.png">

All Pages Functions are under `functions/api` folder. The

# Added resources

- [Learn more about Pages Functions](https://developers.cloudflare.com/pages/platform/functions/)
- [Workers KV](https://developers.cloudflare.com/workers/learning/how-kv-works/)
- [Durable Objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/)
