import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { MockAgent } from "undici";

const fetchMock = new MockAgent();

fetchMock.get("https://example.com").intercept({ path: /.*/ }).reply(200, "fetch mocked")

export default defineWorkersProject({
	test: {
		// @ts-expect-error `defineWorkersProject()` expects `pool` to be
		//  `@cloudflare/vitest-pool-workers"` which won't work for us
		pool: "../..",
		poolOptions: {
			workers: ({ inject }) => ({
				isolatedStorage: false,
				singleWorker: true,
				miniflare: {
					compatibilityDate: "2024-01-01",
					compatibilityFlags: ["nodejs_compat"],
					bindings: { KEY: "value" },
					serviceBindings: {
						WORKER: "worker",
					},
					// This doesn't actually do anything in tests
					upstream: `http://localhost:${inject("port")}`,
					workers: [
						{
							name: 'worker',
							modules: true,
							script: "export default { fetch: (req) => fetch('https://example.com') }",
							fetchMock: fetchMock,
						}
					]
				},
			}),
		},
	},
});
