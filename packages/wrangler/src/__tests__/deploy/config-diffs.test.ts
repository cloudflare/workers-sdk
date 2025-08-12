import { getRemoteConfigDiff } from "../../deploy/config-diffs";
import type { Config, RawConfig } from "../../config";

describe("getRemoteConfigsDiff", () => {
	it("should handle a very simple diffing scenario (no diffs, random order)", () => {
		const { diff, onlyAdditionsIfAny } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				placement: undefined,
				limits: undefined,
				tail_consumers: undefined,
				observability: { enabled: true, head_sampling_rate: 1 },
			},
			{
				name: "silent-firefly-dbe3",
				workers_dev: undefined,
				placement: undefined,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				main: "src/index.js",
				tail_consumers: undefined,
				observability: { enabled: true },
				limits: undefined,
			} as unknown as RawConfig,
			{
				main: "/tmp/src/index.js",
			} as Config
		);

		expect(`${diff}`).toEqual("");
		expect(onlyAdditionsIfAny).toBe(true);
	});

	it("should handle a very simple diffing scenario (some diffs, random order)", () => {
		const { diff, onlyAdditionsIfAny } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				placement: undefined,
				limits: undefined,
				tail_consumers: undefined,
				observability: { enabled: true, head_sampling_rate: 1 },
			},
			{
				compatibility_date: "2025-07-09",
				main: "/tmp/src/index.js",
				compatibility_flags: undefined,
				name: "silent-firefly-dbe3",
				workers_dev: true,
				limits: undefined,
				placement: undefined,
				tail_consumers: undefined,
				observability: { enabled: true, head_sampling_rate: 1 },
			} as unknown as Config,
			{
				main: "/tmp/src/index.js",
			} as Config
		);

		expect(`${diff}`).toMatchInlineSnapshot(`
			"  {
			-   \\"compatibility_date\\": \\"2025-07-08\\",
			+   \\"compatibility_date\\": \\"2025-07-09\\",
			    \\"main\\": \\"/tmp/src/index.js\\",
			    \\"name\\": \\"silent-firefly-dbe3\\",
			    \\"workers_dev\\": true,"
		`);
		expect(onlyAdditionsIfAny).toBe(false);
	});

	it("should handle a diffing scenario with only additions", () => {
		const { diff, onlyAdditionsIfAny } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				placement: undefined,
				limits: undefined,
				tail_consumers: undefined,
				observability: { enabled: true, head_sampling_rate: 1 },
			},
			{
				$schema: "node_modules/wrangler/config-schema.json",
				name: "silent-firefly-dbe3",
				main: "src/index.js",
				compatibility_date: "2025-07-08",
				observability: {
					enabled: true,
					head_sampling_rate: 1,
					logs: {
						head_sampling_rate: 0.95,
						invocation_logs: true,
					},
				},
				account_id: "377c4d8c370d3a28e89f25ec1887fa71",
				kv_namespaces: [{ binding: "MY_KV", id: "my-kv-123" }],
			} satisfies RawConfig,
			{
				main: "/tmp/src/index.js",
			} as Config
		);
		expect(`${diff}`).toMatchInlineSnapshot(`
			"    \\"compatibility_date\\": \\"2025-07-08\\",
			    \\"observability\\": {
			      \\"enabled\\": true,
			-     \\"head_sampling_rate\\": 1
			+     \\"head_sampling_rate\\": 1,
			+     \\"logs\\": {
			+       \\"head_sampling_rate\\": 0.95,
			+       \\"invocation_logs\\": true,
			+       \\"enabled\\": true
			+     }
			    },
			+   \\"kv_namespaces\\": [
			+     {
			+       \\"binding\\": \\"MY_KV\\",
			+       \\"id\\": \\"my-kv-123\\"
			+     }
			+   ],
			    \\"workers_dev\\": true
			  }"
		`);
		expect(onlyAdditionsIfAny).toBe(true);
	});

	it("should handle a diffing scenario with modifications and removals", () => {
		const { diff, onlyAdditionsIfAny } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				placement: undefined,
				limits: undefined,
				tail_consumers: undefined,
				observability: { enabled: true, head_sampling_rate: 1 },
				kv_namespaces: [{ binding: "MY_KV", id: "my-kv-123" }],
			},
			{
				$schema: "node_modules/wrangler/config-schema.json",
				name: "silent-firefly-dbe3",
				main: "src/index.js",
				compatibility_date: "2025-07-09",
				observability: {
					enabled: false,
				},
				account_id: "377c4d8c370d3a28e89f25ec1887fa71",
			} satisfies RawConfig,
			{
				main: "/tmp/src/index.js",
			} as Config
		);
		expect(`${diff}`).toMatchInlineSnapshot(`
			"  {
			    \\"name\\": \\"silent-firefly-dbe3\\",
			    \\"main\\": \\"/tmp/src/index.js\\",
			-   \\"compatibility_date\\": \\"2025-07-08\\",
			+   \\"compatibility_date\\": \\"2025-07-09\\",
			    \\"observability\\": {
			-     \\"enabled\\": true,
			+     \\"enabled\\": false,
			      \\"head_sampling_rate\\": 1
			    },
			-   \\"workers_dev\\": true,
			+   \\"workers_dev\\": true
			-   \\"kv_namespaces\\": [
			-     {
			-       \\"binding\\": \\"MY_KV\\",
			-       \\"id\\": \\"my-kv-123\\"
			-     }
			-   ]
			  }"
		`);
		expect(onlyAdditionsIfAny).toBe(false);
	});
});
