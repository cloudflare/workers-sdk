import { getRemoteConfigDiff } from "../../deploy/config-diffs";
import type { Config, RawConfig } from "../../config";

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
			-   \\"workers_dev\\": true,
			    \\"observability\\": {
			      \\"enabled\\": false,
			      \\"head_sampling_rate\\": 1,

			  ...

			        \\"head_sampling_rate\\": 1,
			        \\"invocation_logs\\": true
			      }
			-   }
			+   },
			+   \\"workers_dev\\": true
			  }"
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
			    \\"observability\\": {
			-     \\"enabled\\": true,
			+     \\"enabled\\": false,
			      \\"head_sampling_rate\\": 1,
			      \\"logs\\": {
			        \\"enabled\\": false,

			  ...

			      }
			    },
			    \\"account_id\\": \\"account-id-123\\",
			+   \\"workers_dev\\": true
			-   \\"workers_dev\\": true,
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

	// The Observability field in the remote configuration has some specific behaviors, for that we have
	// the following tests to make double sure to get these various observability cases right
	// (note: this is however a best effort diffing since we cannot really perform a full one since we loose
	// some information remotely for example `{ observability: { enabled: false, logs: { enabled: false, invocation_logs: false } }, }`
	// remotely just becomes `undefined` completely loosing the fact that `logs` and `invocation_logs` were ever set)
	describe("observability", () => {
		function getObservabilityDiff(
			remoteObservability: RawConfig["observability"],
			localObservability: Config["observability"]
		) {
			return getRemoteConfigDiff(
				{
					observability: remoteObservability,
					workers_dev: true,
				},
				{
					observability: localObservability,
				} as unknown as Config
			);
		}

		it("should treat a remote undefined equal to a remote { enabled: false }", () => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ enabled: false }
			);
			expect(diff.toString()).toMatchInlineSnapshot(`""`);
		});

		it("should treat a remote undefined equal to a remote { enabled: false, logs: { enabled: false } }", () => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ enabled: false, logs: { enabled: false } }
			);
			expect(diff.toString()).toMatchInlineSnapshot(`""`);
		});

		it("should correctly show the diff of boolean when the remote is undefined and the local is { enabled: true }", () => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ enabled: true }
			);
			expect(diff.toString()).toMatchInlineSnapshot(`
				"  {
				    \\"observability\\": {
				-     \\"enabled\\": false,
				+     \\"enabled\\": true,
				      \\"head_sampling_rate\\": 1,
				      \\"logs\\": {
				        \\"enabled\\": false,"
			`);
		});

		it("should correctly show the diff of boolean when the remote is undefined and the local is { logs: { enabled: false } }", () => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ logs: { enabled: true } }
			);
			expect(diff.toString()).toMatchInlineSnapshot(`
				"  {
				    \\"observability\\": {
				      \\"logs\\": {
				-       \\"enabled\\": false,
				+       \\"enabled\\": true,
				        \\"head_sampling_rate\\": 1,
				        \\"invocation_logs\\": true
				      },"
			`);
		});

		it("should correctly not show head_sampling_rate being added remotely", () => {
			const { diff } = getObservabilityDiff(
				// remotely head_sampling_rate is set to 1 even if enabled is false
				{ enabled: false, head_sampling_rate: 1, logs: { enabled: true } },
				{ enabled: false, logs: { enabled: true, invocation_logs: true } }
			);
			expect(diff.toString()).toMatchInlineSnapshot(`""`);
		});

		it("should correctly not show logs.invocation_logs being added remotely", () => {
			const { diff } = getObservabilityDiff(
				// remotely head_sampling_rate is set to 1 even if enabled is false
				{
					logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true },
				},
				{ logs: { enabled: true, head_sampling_rate: 0.9 } }
			);
			expect(diff.toString()).toMatchInlineSnapshot(`
				"    \\"observability\\": {
				      \\"logs\\": {
				        \\"enabled\\": true,
				-       \\"head_sampling_rate\\": 1,
				+       \\"head_sampling_rate\\": 0.9,
				        \\"invocation_logs\\": true
				      },
				      \\"enabled\\": false,"
			`);
		});
	});
});
