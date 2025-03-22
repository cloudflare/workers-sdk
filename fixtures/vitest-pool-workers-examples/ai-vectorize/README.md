# 🤖 AI and Vectorize

This Worker uses the AI and Vectorize bindings. @cloudflare/vitest-pool-workers@^0.8.1 is required to use AI and Vectorize bindings in the Vitest integration.

[!WARNING]

Because Workers AI and Vectorize bindings do not have a local simulator, usage of these bindings will always access your Cloudflare account, and so will incur usage charges even in local development and testing. We recommend mocking any usage of these bindings in your tests as demonstrated in this fixture.
