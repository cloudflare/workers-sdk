# Container-backed Durable Objects

The enabled project tests scheduler-backed default images and Durable Object-managed named images through the real `ctx.container` runtime interface. Both images are built from `wrangler.jsonc` before Vitest starts.

The disabled project retains the same Container configuration but sets `dev.enable_containers` to `false`, so Worker tests that do not use Containers remain Docker-independent.
