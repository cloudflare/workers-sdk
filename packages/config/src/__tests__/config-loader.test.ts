import { assert, describe, it, vi } from "vitest";
import { bindings } from "../bindings";
import { resolveAndValidateConfigExports } from "../config-loader";
import { defineContainer } from "../container-definition";
import { exports as workerExports } from "../exports";
import { defineWorker } from "../worker-definition";
import type {
	ContainerConfigExport,
	ContainerConfigInput,
} from "../container-definition";
import type { ConfigContext } from "../definition";
import type {
	WorkerConfigExport,
	WorkerConfigInput,
} from "../worker-definition";

const compatibilityDate = "2026-09-02";
const baseConfig = {
	type: "worker",
	name: "my-worker",
	compatibilityDate,
} as const;

describe("resolveAndValidateConfigExports", () => {
	it("parses Worker and settings exports", async ({ expect }) => {
		const result = await resolveAndValidateConfigExports(
			{
				default: baseConfig,
				api: { ...baseConfig, name: "api" },
				settings: { type: "settings", accountId: "acc-123" },
			},
			{ mode: undefined }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.default?.name).toBe("my-worker");
			expect(result.data.api?.name).toBe("api");
			expect(result.data.settings?.accountId).toBe("acc-123");
		}
	});

	it("parses a named standalone Container without a Worker", async ({
		expect,
	}) => {
		const container = defineContainer({
			name: "standalone-container",
			image: { reference: "registry.example.com/standalone:latest" },
		});

		const result = await resolveAndValidateConfigExports(
			{ container },
			{ mode: "production" }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.container).toMatchObject({
				type: "container",
				name: "standalone-container",
			});
		}
	});

	it("parses a Durable Object Container", async ({ expect }) => {
		const container = defineContainer({
			name: "durable-object-container",
			schedulingPolicy: "durable-object",
			images: {
				primary: { reference: "registry.example.com/primary:latest" },
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ container },
			{ mode: "production" }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.container).toMatchObject({
				type: "container",
				name: "durable-object-container",
				schedulingPolicy: "durable-object",
			});
		}
	});

	it("rejects a Container on the default export", async ({ expect }) => {
		const container = defineContainer({
			name: "standalone-container",
			image: { reference: "registry.example.com/standalone:latest" },
		});

		const result = await resolveAndValidateConfigExports(
			{ default: container },
			{ mode: "production" }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]).toMatchObject({
				path: ["default"],
				message:
					"The `default` export is reserved for a `worker` config; found a `container` config.",
			});
		}
	});

	it("parses Worker-referenced Container exports", async ({ expect }) => {
		const container = defineContainer({
			name: "my-container",
			image: { dockerfile: "./Dockerfile" },
		});
		const worker = defineWorker({
			name: "my-worker",
			compatibilityDate,
			exports: {
				ContainerDO: workerExports.durableObject({
					storage: "sqlite",
					container,
				}),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: worker, container },
			{ mode: "development" }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			const parsedWorker = result.data.default;
			const parsedContainer = result.data.container;
			assert(parsedWorker?.type === "worker");
			assert(
				parsedContainer?.type === "container" && "image" in parsedContainer
			);
			expect(parsedWorker.exports?.ContainerDO).toMatchObject({
				container: "my-container",
			});
			expect(parsedContainer.image).toEqual({ dockerfile: "./Dockerfile" });
		}
	});

	it("resolves repeated Container references once using the config context", async ({
		expect,
	}) => {
		const containerFactory = vi.fn((ctx: ConfigContext) => ({
			name: `my-container-${ctx.mode}`,
			image: { dockerfile: "./Dockerfile" },
		}));
		const container = defineContainer(containerFactory);
		const worker = defineWorker({
			name: "my-worker",
			compatibilityDate,
			exports: {
				ContainerDO: workerExports.durableObject({
					storage: "sqlite",
					container,
				}),
			},
		});
		const ctx = { mode: "test" };

		const result = await resolveAndValidateConfigExports(
			{ default: worker, container },
			ctx
		);

		expect(result.success).toBe(true);
		expect(containerFactory).toHaveBeenCalledOnce();
		expect(containerFactory).toHaveBeenCalledWith(ctx);
		if (result.success) {
			const parsedWorker = result.data.default;
			assert(parsedWorker?.type === "worker");
			expect(parsedWorker.exports).toMatchObject({
				ContainerDO: { container: "my-container-test" },
			});
		}
	});

	it("rejects a string reference to an exported Container", async ({
		expect,
	}) => {
		const container = defineContainer({
			name: "my-container",
			image: { reference: "registry.example.com/container:latest" },
		});
		const worker = {
			type: "worker",
			name: "my-worker",
			compatibilityDate,
			exports: {
				ContainerDO: {
					type: "durable-object",
					storage: "sqlite",
					container: "my-container",
				},
			},
		};

		const result = await resolveAndValidateConfigExports(
			{ default: worker, container },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]).toMatchObject({
				path: ["default", "exports", "ContainerDO", "container"],
				message:
					"Container provided as a string. Reference an exported Container definition instead.",
			});
		}
	});

	it("rejects an unexported Container reference with an exported Container's name", async ({
		expect,
	}) => {
		const referencedContainer = defineContainer({
			name: "my-container",
			image: { reference: "registry.example.com/referenced:latest" },
		});
		const exportedContainer = defineContainer({
			name: "my-container",
			image: { reference: "registry.example.com/exported:latest" },
		});
		const worker = defineWorker({
			name: "my-worker",
			compatibilityDate,
			exports: {
				ContainerDO: workerExports.durableObject({
					storage: "sqlite",
					container: referencedContainer,
				}),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: worker, container: exportedContainer },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]).toMatchObject({
				path: ["default", "exports", "ContainerDO", "container"],
				message: 'The referenced Container "my-container" is not exported.',
			});
		}
	});

	it("rejects duplicate exported Container names", async ({ expect }) => {
		const first = defineContainer({
			name: "duplicate-container",
			image: { reference: "registry.example.com/first:latest" },
		});
		const second = defineContainer({
			name: "duplicate-container",
			image: { reference: "registry.example.com/second:latest" },
		});

		const result = await resolveAndValidateConfigExports(
			{ first, second },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["second", "name"]);
		}
	});

	it("rejects duplicate exported Worker names", async ({ expect }) => {
		const entry = defineWorker({
			name: "duplicate-worker",
			compatibilityDate,
		});
		const auxiliary = defineWorker({
			name: "duplicate-worker",
			compatibilityDate,
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry, auxiliary },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["auxiliary", "name"]);
		}
	});

	it("rejects a Container referenced by multiple Durable Objects", async ({
		expect,
	}) => {
		const container = defineContainer({
			name: "my-container",
			image: { reference: "registry.example.com/container:latest" },
		});
		const worker = defineWorker({
			name: "my-worker",
			compatibilityDate,
			exports: {
				FirstDO: workerExports.durableObject({
					storage: "sqlite",
					container,
				}),
				SecondDO: workerExports.durableObject({
					storage: "sqlite",
					container,
				}),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: worker, container },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"default",
				"exports",
				"SecondDO",
				"container",
			]);
		}
	});

	it("rejects a Container referenced by Durable Objects in different Workers", async ({
		expect,
	}) => {
		const container = defineContainer({
			name: "my-container",
			image: { reference: "registry.example.com/container:latest" },
		});
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			exports: {
				FirstDO: workerExports.durableObject({
					storage: "sqlite",
					container,
				}),
			},
		});
		const auxiliary = defineWorker({
			name: "auxiliary",
			compatibilityDate,
			exports: {
				SecondDO: workerExports.durableObject({
					storage: "sqlite",
					container,
				}),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry, auxiliary, container },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"auxiliary",
				"exports",
				"SecondDO",
				"container",
			]);
		}
	});

	it("rejects references to non-Container configs", async ({ expect }) => {
		const notAContainer = defineWorker({
			name: "not-a-container",
			compatibilityDate,
		});
		const worker = defineWorker({
			name: "my-worker",
			compatibilityDate,
			exports: {
				ContainerDO: workerExports.durableObject({
					storage: "sqlite",
					container: notAContainer as unknown as ContainerConfigExport,
				}),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: worker },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"default",
				"exports",
				"ContainerDO",
			]);
		}
	});

	it("rejects Container references without a name", async ({ expect }) => {
		const invalidContainer = defineContainer((() => ({
			image: { reference: "registry.example.com/container:latest" },
		})) as unknown as () => ContainerConfigInput);
		const worker = defineWorker({
			name: "my-worker",
			compatibilityDate,
			exports: {
				ContainerDO: workerExports.durableObject({
					storage: "sqlite",
					container: invalidContainer,
				}),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: worker },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"default",
				"exports",
				"ContainerDO",
			]);
		}
	});

	it("collects settings, Worker, and Container validation errors", async ({
		expect,
	}) => {
		const result = await resolveAndValidateConfigExports(
			{
				default: { ...baseConfig, compatibilityDate: 42 },
				container: {
					type: "container",
					name: "",
					image: { dockerfile: "./Dockerfile" },
				},
				settings: { type: "settings", accountId: 42 },
			},
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.map((issue) => issue.path)).toEqual(
				expect.arrayContaining([
					["settings", "accountId"],
					["default", "compatibilityDate"],
					["container", "name"],
				])
			);
		}
	});

	it("reports an invalid-discriminator issue keyed by export name", async ({
		expect,
	}) => {
		const result = await resolveAndValidateConfigExports(
			{
				default: { name: "my-worker", compatibilityDate },
			},
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["default", "type"]);
		}
	});

	it.for([
		{
			description: "object",
			value: { staging: "staging-worker", production: "production-worker" },
			path: ["WORKER_NAMES", "type"],
		},
		{
			description: "primitive",
			value: 42,
			path: ["WORKER_NAMES"],
		},
	])(
		"reports an actionable error for an unknown $description export",
		async ({ value, path }, { expect }) => {
			const result = await resolveAndValidateConfigExports(
				{ default: baseConfig, WORKER_NAMES: value },
				{ mode: undefined }
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0]).toMatchObject({
					path,
					message:
						"The `WORKER_NAMES` export is not a supported export type. Move constants, helper functions, and other unsupported exports to a separate module.",
				});
			}
		}
	);

	it("rejects a settings config on a non-settings export", async ({
		expect,
	}) => {
		const result = await resolveAndValidateConfigExports(
			{
				default: baseConfig,
				settings: { type: "settings" },
				extraSettings: { type: "settings" },
			},
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find((candidate) =>
				candidate.message.includes(
					"A `settings` config is only allowed on the `settings` export"
				)
			);
			expect(issue?.path).toEqual(["extraSettings"]);
		}
	});

	it("rejects a Worker config on the settings export", async ({ expect }) => {
		const result = await resolveAndValidateConfigExports(
			{
				default: baseConfig,
				settings: { ...baseConfig, name: "settings" },
			},
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find((candidate) =>
				candidate.message.includes(
					"The `settings` export is reserved for a `settings` config"
				)
			);
			expect(issue?.path).toEqual(["settings"]);
		}
	});

	it("resolves object Worker references to names", async ({ expect }) => {
		const auxiliary = defineWorker({
			name: "auxiliary",
			compatibilityDate,
		});
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			env: {
				AUXILIARY: bindings.worker({ worker: auxiliary }),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry, auxiliary },
			{ mode: "development" }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			const config = result.data.default;
			assert(config?.type === "worker");
			expect(config.env?.AUXILIARY).toMatchObject({
				type: "worker",
				worker: "auxiliary",
			});
		}
	});

	it("rejects references to non-Worker configs", async ({ expect }) => {
		const notAWorker = defineContainer({
			name: "not-a-worker",
			image: { reference: "registry.example.com/container:latest" },
		});
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			env: {
				AUXILIARY: bindings.worker({
					worker: notAWorker as unknown as WorkerConfigExport,
				}),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual([
				"default",
				"env",
				"AUXILIARY",
				"worker",
			]);
		}
	});

	it("resolves repeated Worker references once using the config context", async ({
		expect,
	}) => {
		const auxiliaryFactory = vi.fn((ctx: ConfigContext) => ({
			name: `auxiliary-${ctx.mode}`,
			compatibilityDate,
			exports: {
				Counter: {
					type: "durable-object" as const,
					storage: "sqlite" as const,
				},
			},
		}));
		const auxiliary = defineWorker(auxiliaryFactory);
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			env: {
				FIRST: bindings.worker({ worker: auxiliary }),
				SECOND: bindings.worker({ worker: auxiliary }),
				COUNTER: bindings.durableObject({
					worker: auxiliary,
					exportName: "Counter",
				}),
			},
		});

		const ctx = { mode: "test" };
		const result = await resolveAndValidateConfigExports(
			{ default: entry },
			ctx
		);

		expect(result.success).toBe(true);
		expect(auxiliaryFactory).toHaveBeenCalledOnce();
		expect(auxiliaryFactory).toHaveBeenCalledWith(ctx);
		if (result.success) {
			const config = result.data.default;
			assert(config?.type === "worker");
			expect(config.env).toMatchObject({
				FIRST: { worker: "auxiliary-test" },
				SECOND: { worker: "auxiliary-test" },
				COUNTER: { worker: "auxiliary-test" },
			});
		}
	});

	it("does not parse unexported Worker references", async ({ expect }) => {
		const invalidFactory = vi.fn(() => ({
			name: "referenced-only",
			compatibilityDate,
			unexpected: true,
		}));
		const referencedOnly = defineWorker(
			invalidFactory as unknown as () => WorkerConfigInput
		);
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			env: {
				FIRST: bindings.worker({ worker: referencedOnly }),
				SECOND: bindings.worker({ worker: referencedOnly }),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry },
			{ mode: "development" }
		);

		expect(result.success).toBe(true);
		expect(invalidFactory).toHaveBeenCalledOnce();
		if (result.success) {
			const config = result.data.default;
			assert(config?.type === "worker");
			expect(config.env).toMatchObject({
				FIRST: { worker: "referenced-only" },
				SECOND: { worker: "referenced-only" },
			});
		}
	});

	it("leaves string Worker references unchanged", async ({ expect }) => {
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			env: {
				EXTERNAL: bindings.worker({ worker: "external-worker" }),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry },
			{ mode: undefined }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			const config = result.data.default;
			assert(config?.type === "worker");
			expect(config.env?.EXTERNAL).toMatchObject({
				worker: "external-worker",
			});
		}
	});

	it("stops after top-level export type errors", async ({ expect }) => {
		const auxiliaryFactory = vi.fn(() => ({
			name: "auxiliary",
			compatibilityDate,
		}));
		const auxiliary = defineWorker(auxiliaryFactory);
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			env: {
				AUXILIARY: bindings.worker({ worker: auxiliary }),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry, UNSUPPORTED: 42 },
			{ mode: undefined }
		);

		expect(result.success).toBe(false);
		expect(auxiliaryFactory).not.toHaveBeenCalled();
		if (!result.success) {
			expect(result.error.issues).toHaveLength(1);
			expect(result.error.issues[0]?.path).toEqual(["UNSUPPORTED"]);
		}
	});

	it("supports mutually-referencing Worker factories", async ({ expect }) => {
		const workers = {} as Record<"first" | "second", WorkerConfigExport>;

		workers.first = defineWorker(() => ({
			name: "first",
			compatibilityDate,
			env: { SECOND: bindings.worker({ worker: workers.second }) },
		}));
		workers.second = defineWorker(() => ({
			name: "second",
			compatibilityDate,
			env: { FIRST: bindings.worker({ worker: workers.first }) },
		}));

		const result = await resolveAndValidateConfigExports(
			{ default: workers.first, second: workers.second },
			{ mode: "development" }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			const first = result.data.default;
			const second = result.data.second;
			assert(first?.type === "worker");
			assert(second?.type === "worker");
			expect(first.env?.SECOND).toMatchObject({
				worker: "second",
			});
			expect(second.env?.FIRST).toMatchObject({
				worker: "first",
			});
		}
	});

	it("parses an exported referenced Worker once", async ({ expect }) => {
		const invalidFactory = vi.fn(() => ({
			name: "invalid",
			compatibilityDate: 42,
		}));
		const invalid = defineWorker(
			invalidFactory as unknown as () => WorkerConfigInput
		);
		const entry = defineWorker({
			name: "entry",
			compatibilityDate,
			env: {
				FIRST: bindings.worker({ worker: invalid }),
				SECOND: bindings.worker({ worker: invalid }),
			},
		});

		const result = await resolveAndValidateConfigExports(
			{ default: entry, invalid },
			{ mode: "development" }
		);

		expect(result.success).toBe(false);
		expect(invalidFactory).toHaveBeenCalledOnce();
		if (!result.success) {
			expect(
				result.error.issues.filter(
					(issue) => issue.path.join(".") === "invalid.compatibilityDate"
				)
			).toHaveLength(1);
		}
	});
});
