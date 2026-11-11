# Container-backed Durable Objects

The enabled project tests scheduler-backed default images and Durable Object-managed named images through the real `ctx.container` runtime interface. The plugin builds both images from `wrangler.jsonc` before the project's tests run.

The `cloudflare.config.ts` project runs the same tests with the Worker and its Containers defined in `cloudflare.config.ts`, which the `config` pool option loads instead of `wrangler.jsonc`.

The disabled project retains the same Container configuration but sets `dev.enable_containers` to `false`, so Worker tests that do not use Containers remain Docker-independent.
