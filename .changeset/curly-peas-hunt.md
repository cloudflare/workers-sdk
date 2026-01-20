---
"wrangler": patch
---

Fix `wrangler login` with custom `callback-host`/`callback-port`

The Cloudflare OAuth API always requires the `redirect_uri` to be `localhost:8976`. However, sometimes the Wrangler OAuth server needed to listen on a different host/port, for example when running from inside a container. We were previously incorrectly setting the `redirect_uri` to the configured callback host/port, but it needs to be up to the user to map `localhost:8976` to the Wrangler OAuth server in the container.

**Example:**

You might run Wrangler inside a docker container like this: `docker run -p 8989:8976 <image>`, which forwards port 8976 on your host to 8989 inside the container.

Then inside the container, run `wrangler login --callback-host=0.0.0.0 --callback-port=8989`

The OAuth link still has a `redirect_uri` set to`localhost:8976`. For example `https://dash.cloudflare.com/oauth2/auth?...&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&...`

However the redirect to` localhost:8976` is then forwarded to the Wrangler OAuth server inside your container, allowing the login to complete.

