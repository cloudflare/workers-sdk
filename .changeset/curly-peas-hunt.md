---
"wrangler": patch
---

Always pass a valid `redirect_uri` callback parameter (`localhost:8976`) to Cloudflare OAuth API, even when the `--callback-host` and `--callback-port` params would not be accepted.

The OAuth provider only accepts `localhost:8976` as the host and port in the `redirect_uri` parameter of the login request.

One can configure the Wrangler's OAuth callback server to listen on custom host, via `--callback-host` (e.g. 0.0.0.0 or 127.0.0.1), and port, via `--callback-port`.
This is useful when running Wrangler inside a Docker container (or equivalent) where it is not possible to listen on `localhost`.

In this case, you can configure Wrangler to listen on a different host and/or port but then it is up to you to configure your container to map `localhost:8976` to the host and port on which Wrangler is listening.

**Example:**

Running the callback server on `127.0.0.1:8989`:

```
wrangler login --calback-host=127.0.0.1 --callback-port=8989
```

results in Wrangler listening on 127.0.0.1:8989 and a login URL that looks like:

```
https://dash.cloudflare.com/oauth2/auth?...&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&...
```

Note that the `redirect_uri` is always `localhost:8976` whatever the callback host and port are.
