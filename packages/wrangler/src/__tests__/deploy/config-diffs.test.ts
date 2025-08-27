import { getRemoteConfigDiff } from "../../deploy/config-diffs";
import type { Config } from "../../config";

describe("getRemoteConfigsDiff", () => {
	it("should handle a very simple diffing scenario (no diffs, random order)", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
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
			} as unknown as Config
		);

		expect(diff.toString()).toEqual("");
		expect(nonDestructive).toBe(true);
	});

	it("should handle a very simple diffing scenario (some diffs, random order)", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
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
				compatibility_flags: [],
				name: "silent-firefly-dbe3",
				workers_dev: true,
				limits: undefined,
				placement: undefined,
				tail_consumers: undefined,
				observability: { enabled: true, head_sampling_rate: 1 },
			} as unknown as Config
		);

		expect(diff.toString()).toMatchInlineSnapshot(`
			"  {
			-   \\"compatibility_date\\": \\"2025-07-08\\",
			+   \\"compatibility_date\\": \\"2025-07-09\\",
			    \\"main\\": \\"/tmp/src/index.js\\",
			    \\"compatibility_flags\\": [],
			    \\"name\\": \\"silent-firefly-dbe3\\","
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should handle a diffing scenario with only additions", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				placement: undefined,
				limits: undefined,
				tail_consumers: undefined,
				account_id: "account-id-123",
				kv_namespaces: [{ binding: "MY_KV", id: "my-kv-123" }],
			},
			{
				name: "silent-firefly-dbe3",
				main: "src/index.js",
				compatibility_date: "2025-07-08",
				account_id: "account-id-123",
				kv_namespaces: [
					{ binding: "MY_KV", id: "my-kv-123" },
					{ binding: "MY_KV_2", id: "my-kv-456" },
				],
			} as unknown as Config
		);
		expect(diff.toString()).toMatchInlineSnapshot(`
			"      {
			        \\"binding\\": \\"MY_KV\\",
			        \\"id\\": \\"my-kv-123\\"
			+     },
			+     {
			+       \\"binding\\": \\"MY_KV_2\\",
			+       \\"id\\": \\"my-kv-456\\"
			      }
			    ],
			    \\"workers_dev\\": true"
		`);
		expect(nonDestructive).toBe(true);
	});

	it("should handle a diffing scenario with modifications and removals", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
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
				name: "silent-firefly-dbe3",
				main: "src/index.js",
				compatibility_date: "2025-07-09",
				observability: {
					enabled: false,
				},
				account_id: "account-id-123",
			} as unknown as Config
		);
		expect(diff.toString()).toMatchInlineSnapshot(`
			"  {
			    \\"name\\": \\"silent-firefly-dbe3\\",
			    \\"main\\": \\"src/index.js\\",
			-   \\"compatibility_date\\": \\"2025-07-08\\",
			+   \\"compatibility_date\\": \\"2025-07-09\\",
			-   \\"observability\\": {
			-     \\"enabled\\": true,
			-     \\"head_sampling_rate\\": 1
			-   },
			    \\"account_id\\": \\"account-id-123\\",
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
		expect(nonDestructive).toBe(false);
	});
});
