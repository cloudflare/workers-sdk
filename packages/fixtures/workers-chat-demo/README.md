This is the demo for durable objects originally published at https://github.com/cloudflare/workers-chat-demo, but with some modifications -

- The html file is imported as a relative import.

```diff
- import HTML from "chat.html";
+ import HTML from "./chat.html";
```

- The following fields are removed from `wrangler.toml` - `type`, `workers_dev`, `account_id`, `build.upload.format`, `build.upload.rules`.

- The `module` field is removed from `package.json`.

- Change calls from `https://...` to `http://...`, and `wss://...` to `ws://...`.

Also a reminder: you need to deploy this worker (or even a plain worker named `edge-chat-demo`) before you can develop on it. That's a problem that we need to solve on our end, but this is a workaround for now.

The original README follows -

# Cloudflare Edge Chat Demo

This is a demo app written on [Cloudflare Workers](https://workers.cloudflare.com/) utilizing [Durable Objects](https://blog.cloudflare.com/introducing-workers-durable-objects) to implement real-time chat with stored history. This app runs 100% on Cloudflare's edge.

Try it here: https://edge-chat-demo.cloudflareworkers.com

The reason this demo is remarkable is because it deals with state. Before Durable Objects, Workers were stateless, and state had to be stored elsewhere. State can mean storage, but it also means the ability to coordinate. In a chat room, when one user sends a message, the app must somehow route that message to other users, via connections that those other users already had open. These connections are state, and coordinating them in a stateless framework is hard if not impossible.

## How does it work?

This chat app uses a Durable Object to control each chat room. Users connect to the object using WebSockets. Messages from one user are broadcast to all the other users. The chat history is also stored in durable storage, but this is only for history. Real-time messages are relayed directly from one user to others without going through the storage layer.

Additionally, this demo uses Durable Objects for a second purpose: Applying a rate limit to messages from any particular IP. Each IP is assigned a Durable Object that tracks recent request frequency, so that users who send too many messages can be temporarily blocked -- even across multiple chat rooms. Interestingly, these objects don't actually store any durable state at all, because they only care about very recent history, and it's not a big deal if a rate limiter randomly resets on occasion. So, these rate limiter objects are an example of a pure coordination object with no storage.

This chat app is only a few hundred lines of code. The deployment configuration is only a few lines. Yet, it will scale seamlessly to any number of chat rooms, limited only by Cloudflare's available resources. Of course, any individual chat room's scalability has a limit, since each object is single-threaded. But, that limit is far beyond what a human participant could keep up with anyway.

For more details, take a look at the code! It is well-commented.

## Learn More

- [Durable Objects introductory blog post](https://blog.cloudflare.com/introducing-workers-durable-objects)
- [Durable Objects documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects)

## Deploy it yourself

If you haven't already, join the Durable Objects beta by visiting the [Cloudflare dashboard](https://dash.cloudflare.com/) and navigating to "Workers" and then "Durable Objects".

Then, make sure you have [Wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update), the official Workers CLI, installed. Version 1.19.3 or newer is required to deploy this example as written.

After installing it, run `wrangler login` to [connect it to your Cloudflare account](https://developers.cloudflare.com/workers/cli-wrangler/authentication).

Once you're in the Durable Objects beta and have Wrangler installed and authenticated, you can deploy the app for the first time by adding your Cloudflare account ID (which can be viewed by running `wrangler whoami`) to the wrangler.toml file and then running:

    wrangler deploy

If you get an error saying "Cannot create binding for class [...] because it is not currently configured to implement durable objects", you need to update your version of Wrangler.

This command will deploy the app to your account under the name `edge-chat-demo`.

## What are the dependencies?

This demo code does not have any dependencies, aside from Cloudflare Workers (for the server side, `chat.mjs`) and a modern web browser (for the client side, `chat.html`). Deploying the code requires Wrangler.

## How to uninstall

Modify wrangler.toml to remove the durable_objects bindings and add a deleted_classes migration. The bottom of your wrangler.toml should look like:

```
[durable_objects]
bindings = [
]

# Indicate that you want the ChatRoom and RateLimiter classes to be callable as Durable Objects.
[[migrations]]
tag = "v1" # Should be unique for each entry
new_classes = ["ChatRoom", "RateLimiter"]

[[migrations]]
tag = "v2"
deleted_classes = ["ChatRoom", "RateLimiter"]
```

Then run `wrangler deploy`, which will delete the Durable Objects and all data stored in them. To remove the Worker, go to [dash.cloudflare.com](dash.cloudflare.com) and navigate to Workers -> Overview -> edge-chat-demo -> Manage Service -> Delete (bottom of page)
