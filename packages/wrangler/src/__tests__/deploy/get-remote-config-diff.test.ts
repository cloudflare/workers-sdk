import { assert, describe, it } from "vitest";
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
	it("should handle a very simple diffing scenario (no diffs, random order)", ({
		expect,
	}) => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
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
				name: "my-worker-id",
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

	it("should handle a very simple diffing scenario where there is only an addition to an array (specifically in `kv_namespaces`)", ({
		expect,
	}) => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
				main: "/tmp/src/index.js",
				workers_dev: true,
				kv_namespaces: [{ binding: "MY_KV", id: "<kv-id>" }],
				preview_urls: true,
			},
			{
				name: "my-worker-id",
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
			-      binding: "MY_KV"
			-      id: "<kv-id>"
			-    }
			   ]
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should handle a very simple diffing scenario (some diffs, random order)", ({
		expect,
	}) => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
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
				name: "my-worker-id",
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
			-  compatibility_date: "2025-07-08"
			+  compatibility_date: "2025-07-09"
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should handle a diffing scenario with only additions", ({ expect }) => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
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
				name: "my-worker-id",
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
			+      binding: "MY_KV_2"
			+      id: "my-kv-456"
			+    }
			   ]
			 }
			"
		`);
		expect(nonDestructive).toBe(true);
	});

	it("should handle a diffing scenario with only deletions", ({ expect }) => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
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
				name: "my-worker-id",
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
			-      binding: "MY_KV"
			-      id: "my-kv-123"
			-    }
			-  ]
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should handle a diffing scenario with modifications and removals", ({
		expect,
	}) => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
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
				name: "my-worker-id",
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
			-      binding: "MY_KV"
			-      id: "my-kv-123"
			-    }
			-  ]
			-  compatibility_date: "2025-07-08"
			+  compatibility_date: "2025-07-09"
			   observability: {
			-    enabled: true
			+    enabled: false
			     logs: {
			-      enabled: true
			+      enabled: false
			     }
			   }
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});

	it("should ignore local-only configs such as `dev` and `build`", ({
		expect,
	}) => {
		const { diff } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
			},
			{
				name: "my-worker-id",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
				compatibility_date: "2025-07-08",
				compatibility_flags: undefined,
				dev: {
					local_protocol: "http",
					port: 8999,
				},
				build: {
					command: "npm run build",
				},
			} as unknown as Config
		);
		expect(diff).toBeNull();
	});

	it("should ignore the `remote` field of bindings during the diffing process (since remote bindings are a local-only concept)", ({
		expect,
	}) => {
		const { diff } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: false,
				compatibility_date: "2025-07-08",
				account_id: "account-id-123",
				services: [
					{
						binding: "my-service",
						service: "my-worker",
					},
				],
				kv_namespaces: [
					{
						binding: "MY_KV",
						id: "my-kv-123",
					},
				],
				r2_buckets: [
					{ binding: "MY_R2_A", bucket_name: "my-bucket-a" },
					{ binding: "MY_R2_B", bucket_name: "my-bucket" },
					{ binding: "MY_R2_C", bucket_name: "my-bucket-c" },
				],
				d1_databases: [{ binding: "MY_D1", database_id: "my-db" }],
				ai: {
					binding: "AI",
				},
				browser: {
					binding: "BROWSER",
				},
				images: {
					binding: "IMAGES",
				},
				send_email: [
					{
						name: "email",
					},
				],
				queues: {
					producers: [
						{
							binding: "MY_QUEUE",
							queue: "my-queue",
						},
					],
				},
				mtls_certificates: [
					{
						certificate_id: "certificate-id",
						binding: "MY_CERT",
					},
				],
				pipelines: [
					{
						binding: "MY_PIPELINE",
						pipeline: "my-pipeline",
					},
				],
				vectorize: [
					{
						binding: "VERCTORIZE",
						index_name: "my-vectorize",
					},
				],
				dispatch_namespaces: [
					{
						binding: "DISPATCH",
						namespace: "namespace",
					},
				],
				media: {
					binding: "MEDIA",
				},
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
					},
				],
				vpc_services: [
					{
						binding: "MY_VPC",
						service_id: "my-vpc",
					},
				],
			},
			{
				name: "my-worker-id",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: false,
				compatibility_date: "2025-07-08",
				account_id: "account-id-123",
				services: [
					{
						binding: "my-service",
						service: "my-worker",
						remote: true,
					},
				],
				kv_namespaces: [
					{
						binding: "MY_KV",
						id: "my-kv-123",
						remote: true,
					},
				],
				r2_buckets: [
					{ binding: "MY_R2_A", bucket_name: "my-bucket-a", remote: true },
					{ binding: "MY_R2_B", bucket_name: "my-bucket" },
					{ binding: "MY_R2_C", bucket_name: "my-bucket-c", remote: false },
				],
				d1_databases: [
					{ binding: "MY_D1", database_id: "my-db", remote: true },
				],
				ai: {
					binding: "AI",
					remote: true,
				},
				browser: {
					binding: "BROWSER",
					remote: false,
				},
				images: {
					binding: "IMAGES",
					remote: true,
				},
				send_email: [
					{
						name: "email",
						remote: true,
					},
				],
				queues: {
					producers: [
						{
							binding: "MY_QUEUE",
							queue: "my-queue",
							remote: false,
						},
					],
				},
				mtls_certificates: [
					{
						certificate_id: "certificate-id",
						binding: "MY_CERT",
						remote: true,
					},
				],
				pipelines: [
					{
						binding: "MY_PIPELINE",
						pipeline: "my-pipeline",
						remote: true,
					},
				],
				vectorize: [
					{
						binding: "VERCTORIZE",
						index_name: "my-vectorize",
						remote: true,
					},
				],
				dispatch_namespaces: [
					{
						binding: "DISPATCH",
						namespace: "namespace",
						remote: true,
					},
				],
				media: {
					binding: "MEDIA",
					remote: true,
				},
				workflows: [
					{
						binding: "MY_WORKFLOW",
						name: "my-workflow",
						class_name: "MyWorkflow",
						remote: false,
					},
				],
				vpc_services: [
					{
						binding: "MY_VPC",
						service_id: "my-vpc",
						remote: true,
					},
				],
			} as unknown as Config
		);
		expect(diff).toBeNull();
	});

	it("should ignore all fields from an assets binding besides the binding name (since remotely only that information is stored)", ({
		expect,
	}) => {
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker-id",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: false,
				compatibility_date: "2025-07-08",
				account_id: "account-id-123",
				assets: {
					binding: "ASSETS",
				},
			},
			{
				name: "my-worker-id",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: false,
				compatibility_date: "2025-07-08",
				account_id: "account-id-123",
				assets: {
					binding: "MY_ASSETS",
					// Note: The directory and html_handling fields are ignored
					directory: "public",
					html_handling: "drop-trailing-slash",
				},
			} as unknown as Config
		);
		assert(diff);
		expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
			" {
			   assets: {
			-    binding: "ASSETS"
			+    binding: "MY_ASSETS"
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

		it("shouldn't present any diff when the local config is just { enabled: true } and the remote observability is enabled with its default values", ({
			expect,
		}) => {
			const { diff, nonDestructive } = getObservabilityDiff(
				{
					enabled: true,
					head_sampling_rate: 1,
					logs: {
						enabled: true,
						head_sampling_rate: 1,
						persist: true,
						invocation_logs: true,
					},
					traces: { enabled: false, persist: true, head_sampling_rate: 1 },
				},
				{ enabled: true }
			);
			expect(diff).toBe(null);
			expect(nonDestructive).toBe(true);
		});

		it("should treat a remote undefined equal to a remote { enabled: false }", ({
			expect,
		}) => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ enabled: false }
			);
			expect(diff).toBe(null);
		});

		it("should treat a remote undefined equal to a remote { enabled: false, logs: { enabled: false } }", ({
			expect,
		}) => {
			const { diff } = getObservabilityDiff(
				// remotely the observability field is undefined when observability is disabled
				undefined,
				{ enabled: false, logs: { enabled: false } }
			);
			expect(diff).toBe(null);
		});

		it("should correctly show the diff of boolean when the remote is undefined and the local is { enabled: true }", ({
			expect,
		}) => {
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
				     logs: {
				-      enabled: false
				+      enabled: true
				     }
				   }
				 }
				"
			`);
		});

		it("should correctly show the diff of boolean when the remote is undefined and the local is { logs: { enabled: false } }", ({
			expect,
		}) => {
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

		it("should correctly not show head_sampling_rate being added remotely", ({
			expect,
		}) => {
			const { diff } = getObservabilityDiff(
				// remotely head_sampling_rate is set to 1 even if enabled is false
				{ enabled: false, head_sampling_rate: 1, logs: { enabled: true } },
				{ enabled: false, logs: { enabled: true, invocation_logs: true } }
			);
			expect(diff).toBe(null);
		});

		it("should correctly not show logs.invocation_logs being added remotely", ({
			expect,
		}) => {
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

	it("should not show spurious diffs when binding arrays have same elements in different order", ({
		expect,
	}) => {
		// This test verifies that:
		// - Same bindings with different array/property order produce no diff
		// - Actual binding differences are still shown correctly
		// - Both non-nested (kv_namespaces) and nested (durable_objects.bindings) arrays work
		const { diff, nonDestructive } = getRemoteConfigDiff(
			{
				name: "my-worker",
				main: "/tmp/src/index.js",
				workers_dev: true,
				preview_urls: true,
				// Non-nested binding with different array/property order AND actual difference
				// KV_A and KV_B are same (different order), KV_C is remote-only
				kv_namespaces: [
					{ id: "id-1", binding: "KV_A" },
					{ id: "id-2", binding: "KV_B" },
					{ id: "id-3", binding: "KV_C" },
				],
				// Same elements, different order - should not appear in diff
				queues: {
					producers: [
						{ binding: "QUEUE_A", queue: "queue-a" },
						{ binding: "QUEUE_B", queue: "queue-b" },
					],
				},
				// Nested binding with actual difference - DO_C is remote-only
				durable_objects: {
					bindings: [
						{ name: "DO_A", class_name: "DurableObjectA" },
						{ name: "DO_C", class_name: "DurableObjectC" },
					],
				},
			},
			{
				name: "my-worker",
				main: "/tmp/src/index.js",
				// Local has different array order and { binding, id } property order
				// KV_A and KV_B are same (different order), KV_D is local-only
				kv_namespaces: [
					{ binding: "KV_B", id: "id-2" },
					{ binding: "KV_A", id: "id-1" },
					{ binding: "KV_D", id: "id-4" },
				],
				queues: {
					producers: [
						{ binding: "QUEUE_B", queue: "queue-b" },
						{ binding: "QUEUE_A", queue: "queue-a" },
					],
				},
				// DO_B is local-only
				durable_objects: {
					bindings: [
						{ name: "DO_B", class_name: "DurableObjectB" },
						{ name: "DO_A", class_name: "DurableObjectA" },
					],
				},
			} as unknown as Config
		);

		// kv_namespaces and durable_objects show actual diffs
		// queues.producers has no diff (same elements, different order)
		assert(diff);
		expect(normalizeDiff(diff.toString())).toMatchInlineSnapshot(`
			" {
			   kv_namespaces: [
			     ...
			     ...
			     {
			-      id: "id-3"
			+      id: "id-4"
			-      binding: "KV_C"
			+      binding: "KV_D"
			     }
			   ]
			   durable_objects: {
			     bindings: [
			+      {
			+        name: "DO_B"
			+        class_name: "DurableObjectB"
			+      }
			       ...
			-      {
			-        name: "DO_C"
			-        class_name: "DurableObjectC"
			-      }
			     ]
			   }
			 }
			"
		`);
		expect(nonDestructive).toBe(false);
	});
});
