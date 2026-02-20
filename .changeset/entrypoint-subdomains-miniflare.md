---
"miniflare": minor
---

Add `unsafeEntrypointSubdomains` option for localhost subdomain routing

Workers can now expose entrypoints via localhost subdomains during local development. When configured, requests to `http://{entrypoint}.{worker}.localhost:{port}` are routed to the corresponding entrypoint, and `http://{worker}.localhost:{port}` routes to the worker's default entrypoint.

A DNS compatibility check will run on startup when `unsafeEntrypointSubdomains` is specified and warns if the system's resolver doesn't support `*.localhost` subdomains.
