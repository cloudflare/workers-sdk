import { describe, test, vi } from "vitest";
import {
	MiniflareOptionsSchema,
	MiniflareWorkerConfigSchema,
	WorkerOptionsSchema,
} from "../../src/config/schema";

vi.mock("../../src/plugins/shared/constants", () => ({
	HOST_CAPNP_CONNECT: "localhost:0",
}));

describe("MiniflareWorkerConfigSchema", () => {
	test("requires manifest modulesRoot to be absolute", ({ expect }) => {
		const result = MiniflareWorkerConfigSchema.safeParse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			manifest: {
				mainModule: "index.mjs",
				modulesRoot: "src",
				modules: { "index.mjs": { type: "esm", contents: "" } },
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual([
				expect.objectContaining({
					path: ["manifest", "modulesRoot"],
					message: "Path must be absolute",
				}),
			]);
		}
	});

	test("defaults manifest modulesRoot to cwd", ({ expect }) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			manifest: {
				mainModule: "index.mjs",
				modules: { "index.mjs": { type: "esm", contents: "" } },
			},
		});

		expect(parsed.manifest?.modulesRoot).toBe(process.cwd());
	});

	test("requires dev rootPath to be absolute", ({ expect }) => {
		const result = WorkerOptionsSchema.safeParse({
			config: {
				type: "worker",
				name: "api",
				compatibilityDate: "2026-01-01",
			},
			dev: { rootPath: "project" },
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual([
				expect.objectContaining({
					path: ["dev", "rootPath"],
					message: "Path must be absolute",
				}),
			]);
		}
	});

	test("defaults dev rootPath to cwd", ({ expect }) => {
		const parsed = WorkerOptionsSchema.parse({
			config: {
				type: "worker",
				name: "api",
				compatibilityDate: "2026-01-01",
			},
		});

		expect(parsed.dev.rootPath).toBe(process.cwd());
	});

	test("defaults resource binding identifiers from binding and worker names", ({
		expect,
	}) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				KV: { type: "kv" },
				DB: { type: "d1" },
				FLAGS: { type: "flagship" },
				BUCKET: { type: "r2" },
				AE: { type: "analytics-engine-dataset" },
				QUEUE: { type: "queue" },
			},
		});

		expect(parsed.env).toMatchObject({
			KV: { type: "kv", id: "KV-api" },
			DB: { type: "d1", id: "DB-api" },
			FLAGS: { type: "flagship", id: "FLAGS-api" },
			BUCKET: { type: "r2", name: "BUCKET-api" },
			AE: { type: "analytics-engine-dataset", name: "AE-api" },
			QUEUE: { type: "queue", name: "QUEUE-api" },
		});
	});

	test("rejects duplicate singleton bindings", ({ expect }) => {
		const result = MiniflareWorkerConfigSchema.safeParse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				BROWSER: { type: "browser" },
				OTHER_BROWSER: { type: "browser" },
				IMAGES: { type: "images" },
				OTHER_IMAGES: { type: "images" },
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual([
				expect.objectContaining({
					path: ["env"],
					message: "browser and images bindings can only be defined once",
				}),
			]);
		}
	});

	test("allows duplicate non-singleton bindings", ({ expect }) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				KV: { type: "kv" },
				OTHER_KV: { type: "kv" },
			},
		});

		expect(parsed.env).toMatchObject({
			KV: { type: "kv", id: "KV-api" },
			OTHER_KV: { type: "kv", id: "OTHER_KV-api" },
		});
	});

	test("defaults resource binding identifiers to worker for unnamed workers", ({
		expect,
	}) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "",
			compatibilityDate: "2026-01-01",
			env: {
				KV: { type: "kv" },
			},
		});

		expect(parsed.env?.KV).toMatchObject({ type: "kv", id: "KV-worker" });
	});

	test("preserves explicit resource binding identifiers", ({ expect }) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				KV: { type: "kv", id: "custom-kv" },
				DB: { type: "d1", id: "custom-db" },
				FLAGS: { type: "flagship", id: "custom-flags" },
				BUCKET: { type: "r2", name: "custom-bucket" },
				AE: { type: "analytics-engine-dataset", name: "custom-dataset" },
				QUEUE: { type: "queue", name: "custom-queue" },
			},
		});

		expect(parsed.env).toMatchObject({
			KV: { type: "kv", id: "custom-kv" },
			DB: { type: "d1", id: "custom-db" },
			FLAGS: { type: "flagship", id: "custom-flags" },
			BUCKET: { type: "r2", name: "custom-bucket" },
			AE: { type: "analytics-engine-dataset", name: "custom-dataset" },
			QUEUE: { type: "queue", name: "custom-queue" },
		});
	});

	test("requires Hyperdrive dev.connectionString", ({ expect }) => {
		const result = MiniflareWorkerConfigSchema.safeParse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				HYPERDRIVE: { type: "hyperdrive", id: "hyperdrive", dev: {} },
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual([
				expect.objectContaining({
					path: ["env", "HYPERDRIVE", "dev", "connectionString"],
					message: "Invalid input: expected string, received undefined",
				}),
			]);
		}

		expect(
			MiniflareWorkerConfigSchema.parse({
				type: "worker",
				name: "api",
				compatibilityDate: "2026-01-01",
				env: {
					HYPERDRIVE: {
						type: "hyperdrive",
						id: "hyperdrive",
						dev: {
							connectionString:
								"postgres://user:password@localhost:5432/database",
						},
					},
				},
			}).env?.HYPERDRIVE
		).toEqual({
			type: "hyperdrive",
			id: "hyperdrive",
			dev: {
				connectionString: "postgres://user:password@localhost:5432/database",
			},
		});
	});

	test("rejects dev options on Workflow bindings", ({ expect }) => {
		const result = MiniflareWorkerConfigSchema.safeParse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			env: {
				WORKFLOW: {
					type: "workflow",
					name: "workflow",
					workerName: "api",
					exportName: "Workflow",
					dev: { remote: true },
				},
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual([
				expect.objectContaining({
					path: ["env", "WORKFLOW"],
					message: 'Unrecognized key: "dev"',
				}),
			]);
		}
	});

	test("strips tombstoned durable object exports", ({ expect }) => {
		const parsed = MiniflareWorkerConfigSchema.parse({
			type: "worker",
			name: "api",
			compatibilityDate: "2026-01-01",
			exports: {
				LiveObject: { type: "durable-object", storage: "sqlite" },
				IncomingObject: {
					type: "durable-object",
					state: "expecting-transfer",
					storage: "sqlite",
					transferFrom: "old-worker/TransferredObject",
				},
				DeletedObject: { type: "durable-object", state: "deleted" },
				RenamedObject: {
					type: "durable-object",
					state: "renamed",
					renamedTo: "LiveObject",
				},
				TransferredObject: {
					type: "durable-object",
					state: "transferred",
					transferredTo: "other-worker/OtherObject",
				},
				Entrypoint: { type: "worker" },
			},
		});

		expect(parsed.exports).toEqual({
			LiveObject: { type: "durable-object", storage: "sqlite" },
			IncomingObject: {
				type: "durable-object",
				state: "expecting-transfer",
				storage: "sqlite",
				transferFrom: "old-worker/TransferredObject",
			},
			Entrypoint: { type: "worker" },
		});
	});
});

describe("MiniflareOptionsSchema", () => {
	const worker = {
		config: {
			type: "worker" as const,
			name: "worker",
			compatibilityDate: "2025-01-01",
		},
	};

	test("resolves the isolated root to the resource root without shared storage", ({
		expect,
	}) => {
		const parsed = MiniflareOptionsSchema.parse({
			resourcePersistencePath: "/state",
			workers: [worker],
		});

		// Nothing is shared, so every resource is isolated and belongs under the
		// configured resource root. Readers must not have to work this out.
		expect(parsed.isolatedResourcePersistencePath).toBe("/state");
	});

	test("keeps an explicit isolated root when shared storage is enabled", ({
		expect,
	}) => {
		const parsed = MiniflareOptionsSchema.parse({
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: "/shared",
			isolatedResourcePersistencePath: "/isolated",
			unsafeDevRegistryPath: "/registry",
			workers: [worker],
		});

		expect(parsed.resourcePersistencePath).toBe("/shared");
		expect(parsed.isolatedResourcePersistencePath).toBe("/isolated");
	});

	test("leaves the isolated root unset when nothing is persisted", ({
		expect,
	}) => {
		const parsed = MiniflareOptionsSchema.parse({ workers: [worker] });

		expect(parsed.isolatedResourcePersistencePath).toBeUndefined();
	});
});
