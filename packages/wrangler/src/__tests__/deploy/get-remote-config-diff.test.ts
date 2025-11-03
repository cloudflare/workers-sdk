import { getRemoteConfigDiff } from "../../deploy/config-diffs";
import type { Config, RawConfig } from "@cloudflare/workers-utils";

function normalizeDiff(log: string): string {
	let normalizedLog = log;

	// Let's remove the various extra characters for colors to get a more clear
	normalizedLog = normalizedLog
		.replaceAll("", "X")
		.replaceAll(/X\[\d+(?:;\d+)?m/g, "");

	// Let's also normalize Windows newlines
	normalizedLog = normalizedLog.replaceAll("\r\n", "\n");

	return normalizedLog;
}

describe("getRemoteConfigsDiff", () => {
	it("should handle a very simple diffing scenario (no diffs, random order)", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
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

		expect(diff).toBe(null);
		expect(nonDestructive).toBe(true);
	});

	it("should handle a very simple diffing scenario where there is only an addition to an array (specifically in `kv_namespaces`)", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				kv_namespaces: [{ binding: "MY_KV", id: "<kv-id>" }],
				preview_urls: true,
			},
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
				kv_namespaces: [],
			} as unknown as Config
		);

		assert(diff);
		expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
			" {
			   kv_namespaces: [
			-    {
			-      binding: \\"MY_KV\\"
			-      id: \\"<kv-id>\\"
			-    }
			   ]
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should handle a very simple diffing scenario (some diffs, random order)", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
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

		assert(diff);
		expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
			" {
			-  compatibility_date: \\"2025-07-08\\"
			+  compatibility_date: \\"2025-07-09\\"
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should handle a diffing scenario with only additions", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
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
		assert(diff);
		expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
			" {
			   kv_namespaces: [
			     ...
			+    {
			+      binding: \\"MY_KV_2\\"
			+      id: \\"my-kv-456\\"
			+    }
			   ]
			 }
			"
		`);
		expect(nonDestructive).toBe(true);
	});

	it("should handle a diffing scenario with only deletions", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: false,
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
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: false,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				placement: undefined,
				limits: undefined,
				tail_consumers: undefined,
				account_id: "account-id-123",
			} as unknown as Config
		);
		assert(diff);
		expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
			" {
			-  kv_namespaces: [
			-    {
			-      binding: \\"MY_KV\\"
			-      id: \\"my-kv-123\\"
			-    }
			-  ]
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should handle a diffing scenario with modifications and removals", () => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "silent-firefly-dbe3",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
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
		assert(diff);
		expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
			" {
			-  kv_namespaces: [
			-    {
			-      binding: \\"MY_KV\\"
			-      id: \\"my-kv-123\\"
			-    }
			-  ]
			-  compatibility_date: \\"2025-07-08\\"
			+  compatibility_date: \\"2025-07-09\\"
			   observability: {
			-    enabled: true
			+    enabled: false
			   }
			 }
			"
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
					preview_urls: true,
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
			expect(diff).toBe(null);
		});

		it("should treat a remote undefined equal to a remote { enabled: false, logs: { enabled: false } }", () => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ enabled: false, logs: { enabled: false } }
			);
			expect(diff).toBe(null);
		});

		it("should correctly show the diff of boolean when the remote is undefined and the local is { enabled: true }", () => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ enabled: true }
			);
			assert(diff);
			expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
				" {
				   observability: {
				-    enabled: false
				+    enabled: true
				   }
				 }
				"
			`);
		});

		it("should correctly show the diff of boolean when the remote is undefined and the local is { logs: { enabled: false } }", () => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ logs: { enabled: true } }
			);
			assert(diff);
			expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
				" {
				   observability: {
				     logs: {
				-      enabled: false
				+      enabled: true
				     }
				   }
				 }
				"
			`);
		});

		it("should correctly not show head_sampling_rate being added remotely", () => {
			const { diff } = getObservabilityDiff(
				// remotely head_sampling_rate is set to 1 even if enabled is false
				{ enabled: false, head_sampling_rate: 1, logs: { enabled: true } },
				{ enabled: false, logs: { enabled: true, invocation_logs: true } }
			);
			expect(diff).toBe(null);
		});

		it("should correctly not show logs.invocation_logs being added remotely", () => {
			const { diff } = getObservabilityDiff(
				// remotely head_sampling_rate is set to 1 even if enabled is false
				{
					logs: { enabled: true, head_sampling_rate: 1, invocation_logs: true },
				},
				{ logs: { enabled: true, head_sampling_rate: 0.9 } }
			);
			assert(diff);
			expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
				" {
				   observability: {
				     logs: {
				-      head_sampling_rate: 1
				+      head_sampling_rate: 0.9
				     }
				   }
				 }
				"
			`);
		});
	});
});
