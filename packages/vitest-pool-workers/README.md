# `@cloudflare/vitest-pool-workers`

The Workers Vitest integration allows you to write Vitest tests that run inside the Workers runtime.
Refer to the [documentation](https://developers.cloudflare.com/workers/testing/vitest-integration/) and [examples](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/) for more information.

- ✅ Supports both **unit tests** and **integration tests**
- 📚 Provides direct access to Workers runtime APIs and bindings
- 📦 Implements isolated per-test storage
- 🔥 Runs tests fully-locally using [Miniflare](https://miniflare.dev/)
- ⚡️ Leverages Vitest's hot-module reloading for near instant reruns
- ↩️ Provides a declarative interface for mocking outbound requests
- 🧩 Supports projects with multiple Workers
