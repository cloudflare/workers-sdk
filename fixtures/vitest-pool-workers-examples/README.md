# `@cloudflare/vitest-pool-workers` Examples

This directory contains example projects tested with `@cloudflare/vitest-pool-workers`. It aims to provide the building blocks for you to write tests for your own Workers.

| Directory                                                                         | Overview                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [✅ basics-unit-integration-self](basics-unit-integration-self)                   | Basic unit tests and integration tests using `exports.default`     |
| [⚠️ basics-integration-auxiliary](basics-integration-auxiliary)                   | Basic integration tests using an auxiliary worker[^1]              |
| [⚡️ pages-functions-unit-integration-self](pages-functions-unit-integration-self) | Functions unit tests and integration tests using `exports.default` |
| [📦 kv-r2-caches](kv-r2-caches)                                                   | Tests using KV, R2 and the Cache API                               |
| [📚 d1](d1)                                                                       | Tests using D1 with migrations                                     |
| [📌 durable-objects](durable-objects)                                             | Tests using Durable Objects with direct access                     |
| [🔁 workflows](workflows)                                                         | Tests using Workflows                                              |
| [🚥 queues](queues)                                                               | Tests using Queue producers and consumers                          |
| [🚰 pipelines](pipelines)                                                         | Tests using Pipelines                                              |
| [🚀 hyperdrive](hyperdrive)                                                       | Tests using Hyperdrive with a Vitest managed TCP server            |
| [🤹 request-mocking](request-mocking)                                             | Tests using declarative (MSW) / imperative outbound request mocks  |
| [🔌 multiple-workers](multiple-workers)                                           | Tests using multiple auxiliary workers and request mocks           |
| [⚙️ web-assembly](web-assembly)                                                   | Tests importing WebAssembly modules                                |
| [🤯 rpc](rpc)                                                                     | Tests using named entrypoints, Durable Objects and RPC             |
| [🧠 ai-vectorize](ai-vectorize)                                                   | Tests using Workers AI and Vectorize                               |
| [🔄 context-exports](context-exports)                                             | Tests using context exports                                        |
| [📥 dynamic-import](dynamic-import)                                               | Tests using dynamic imports                                        |
| [🖼️ images](images)                                                               | Tests using the Images binding                                     |

[^1]: When using `exports.default` for integration tests, your worker code runs in the same context as the test runner. This means you can use global mocks to control your worker, but also means your worker uses the same subtly different module resolution behaviour provided by Vite. Usually this isn't a problem, but if you'd like to run your worker in a fresh environment that's as close to production as possible, using an auxiliary worker may be a good idea. Note this prevents global mocks from controlling your worker, and requires you to build your worker ahead-of-time. This means your tests won't re-run automatically if you change your worker's source code, but could be useful if you have a complicated build process (e.g. full-stack framework).
