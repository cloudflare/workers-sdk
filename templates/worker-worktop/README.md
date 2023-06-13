## Template: worker-worktop

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-worktop)

This template utilizes the [`worktop`](https://github.com/lukeed/worktop) framework to construct an API endpoint to serve user-specific TODO lists. The endpoint includes:

- TypeScript, strict mode
- CORS, with preflight checks
- Routing, with subrouter organization
- JWT (`HS256`) token verification and signing
- KV Namespace as the data storage layer for `todos` and `users` resource types

## Setup

To create a `my-project` directory using this template, run:

```sh
$ npm init cloudflare my-project worktop --no-delegate-c3
# or
$ yarn create cloudflare my-project worktop --no-delegate-c3
# or
$ pnpm create cloudflare my-project worktop --no-delegate-c3
```

> **Note:** Each command invokes [`create-cloudflare`](https://www.npmjs.com/package/create-cloudflare) for project creation.

You will need to add a `JWT_SECRET` for your project for JWT token signing and verification.

```sh
$ wrangler secret put JWT_SECRET <value>
```

> Refer to [Wrangler Secrets](https://developers.cloudflare.com/workers/wrangler/commands/#secret) for documentation.

## Requests

Example client workflow for using this template:

```sh
# Create/Register a new user token
$ curl -X POST http://localhost:8787/auth/login
#=> {"token":"eyJh...TkE0"}

# Reuse/Refresh an existing user token
$ curl -X POST \
  -H "Authorization: Bearer eyJh...TkE0" \
  http://localhost:8787/auth/login
#=> {"token":"eyJh...LU08"}

# Create a TODO for the user
$ curl -X POST \
  -H "Authorization: Bearer eyJh...TkE0" \
  -d "text=hello world"
  http://localhost:8787/todos
#=> {
#=>  "uid": "01G2QZJ2SG13979HNG8GR4J46A",
#=>  "owner": "c7499f55-3073-41f4-9ccf-1a2ccdebecbc",
#=>  "text": "hello world",
#=>  "done": false
#=> }

# Update a TODO for the user
$ curl -X PATCH \
  -H "Authorization: Bearer eyJh...TkE0" \
  -d "done=1"
  http://localhost:8787/todos/01G2QZJ2SG13979HNG8GR4J46A
#=> {
#=>  "uid": "01G2QZJ2SG13979HNG8GR4J46A",
#=>  "owner": "c7499f55-3073-41f4-9ccf-1a2ccdebecbc",
#=>  "text": "hello world",
#=>  "done": true
#=> }

# List all TODO IDs owned by the user
$ curl -X GET \
  -H "Authorization: Bearer eyJh...TkE0" \
  -d "done=1"
  http://localhost:8787/todos
#=> ["01G2QZJ2SG13979HNG8GR4J46A"]

# Get a TODO owned by the user
$ curl -X GET \
  -H "Authorization: Bearer eyJh...TkE0" \
  -d "done=1"
  http://localhost:8787/todos/01G2QZJ2SG13979HNG8GR4J46A
#=> {
#=>  "uid": "01G2QZJ2SG13979HNG8GR4J46A",
#=>  "owner": "c7499f55-3073-41f4-9ccf-1a2ccdebecbc",
#=>  "text": "hello world",
#=>  "done": true
#=> }

# Get a TODO that is NOT owned by the user
$ curl -X GET \
  -H "Authorization: Bearer eyJh...TkE0" \
  http://localhost:8787/todos/123
#=> Item not found

# Delete a TODO owned by the user
$ curl -X DELETE \
  -H "Authorization: Bearer eyJh...TkE0" \
  http://localhost:8787/todos/01G2QZJ2SG13979HNG8GR4J46A
#=> (204) ""
```
