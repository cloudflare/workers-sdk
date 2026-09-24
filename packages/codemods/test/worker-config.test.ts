import { describe, it } from "vitest";
import { renderCloudflareConfig } from "../src/codemods/wrangler-to-cf/config-renderer";
import { convertRootConfig } from "../src/codemods/wrangler-to-cf/worker-config";
import type {
	ConvertedWranglerConfig,
	MigrationFollowUp,
} from "../src/codemods/wrangler-to-cf/types";

function convert(source: Record<string, unknown>): {
	followUps: MigrationFollowUp[];
	output: string;
} {
	const followUps: MigrationFollowUp[] = [];
	const imports = new Set<string>();
	const config = convertRootConfig(source, "", "vite", imports, followUps);
	const converted: ConvertedWranglerConfig = {
		base: { config },
		environments: new Map(),
		followUps,
		imports,
		toolingEnvironments: new Map(),
	};
	return {
		followUps,
		output: renderCloudflareConfig(converted),
	};
}

describe("Wrangler Worker configuration conversion", () => {
	it("converts core settings, triggers, bindings, and exports", ({
		expect,
	}) => {
		const result = convert({
			account_id: "account-id",
			addresses: [],
			assets: {
				html_handling: "auto-trailing-slash",
				not_found_handling: "404-page",
			},
			compatibility_date: "2026-09-23",
			compatibility_flags: ["nodejs_compat"],
			connect: [
				{
					idle_timeout_ms: 5_000,
					max_pending_bytes: 65_536,
					port: 53,
					protocol: "udp",
				},
			],
			exports: {
				Counter: { storage: "sqlite", type: "durable-object" },
				Entrypoint: { cache: { enabled: true }, type: "worker" },
			},
			kv_namespaces: [{ binding: "CACHE", id: "namespace-id" }],
			main: "src/index.ts",
			name: "example-worker",
			observability: { enabled: true, head_sampling_rate: 0.5 },
			queues: {
				consumers: [{ max_batch_size: 10, queue: "jobs" }],
			},
			routes: [
				"example.com/*",
				{ custom_domain: true, pattern: "api.example.com" },
			],
			triggers: { crons: ["0 * * * *"] },
			vars: { MODE: "production" },
		});

		expect(result).toMatchSnapshot();
		expect(result.output).toContain("idleTimeoutMs: 5000");
		expect(result.output).toContain("addresses: []");
	});

	it("guards output that requires manual migration", ({ expect }) => {
		const result = convert({
			containers: [{}],
			migrations: [{ new_classes: ["Counter"], tag: "v1" }],
			routes: [{ pattern: "example.com/*", zone_id: "zone-id" }],
			site: { bucket: "./public" },
			unsafe: {
				capnp: { base_path: "./schemas" },
				metadata: { build: "test" },
			},
		});

		expect(result.followUps.map(({ code }) => code)).toEqual(
			expect.arrayContaining([
				"container-review",
				"durable-object-migrations",
				"missing-compatibility-date",
				"missing-name",
				"unsupported-field",
				"zone-id-route",
			])
		);
		expect(result.output).toContain("Migration incomplete");
		expect(result).toMatchSnapshot();
	});
});
