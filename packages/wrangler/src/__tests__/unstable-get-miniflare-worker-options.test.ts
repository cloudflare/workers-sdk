import { describe, it } from "vitest";
import { unstable_getMiniflareWorkerOptions } from "../api";
import type { Config } from "@cloudflare/workers-utils";

function makeConfig(
	overrides: Partial<{
		dev: { host?: string; enable_containers?: boolean; container_engine?: string };
		route: string;
		routes: string[];
	}> = {}
): Config {
	return {
		name: "test-worker",
		main: "./src/index.ts",
		compatibility_date: "2025-06-17",
		compatibility_flags: [],
		rules: [],
		queues: { producers: [], consumers: [] },
		migrations: [],
		tail_consumers: undefined,
		streaming_tail_consumers: undefined,
		containers: [],
		assets: undefined,
		define: {},
		bindings: [],
		compliance_region: undefined,
		dev: {
			ip: "localhost",
			port: undefined,
			local_protocol: "http",
			upstream_protocol: "http",
			enable_containers: false,
			...overrides.dev,
		},
		...overrides,
	} as unknown as Config;
}

describe("unstable_getMiniflareWorkerOptions", () => {
	it("forwards dev.host as the Miniflare zone", ({ expect }) => {
		const { workerOptions } = unstable_getMiniflareWorkerOptions(
			makeConfig({
				dev: { host: "example.workers.dev" },
			})
		);

		expect(workerOptions.zone).toBe("example.workers.dev");
	});

	it("infers the Miniflare zone from the first route when dev.host is unset", ({
		expect,
	}) => {
		const { workerOptions } = unstable_getMiniflareWorkerOptions(
			makeConfig({
				routes: ["https://subdomain.example.com/*"],
			})
		);

		expect(workerOptions.zone).toBe("subdomain.example.com");
	});
});
