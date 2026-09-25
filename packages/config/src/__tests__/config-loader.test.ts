import { describe, it, vi } from "vitest";
import { bindings } from "../bindings";
import {
	resolveAndParseConfig,
	resolveAndParseConfigSettings,
} from "../config-loader";
import {
	defineConfig,
	defineContainer,
	defineWorker,
	type ConfigContext,
} from "../definition";
import { exports as workerExports } from "../exports";
import type { WorkerConfig } from "../types";

const compatibilityDate = "2026-09-02";

describe("resolveAndParseConfig", () => {
	it("resolves definitions with the Preview build context", async ({
		expect,
	}) => {
		const worker = defineWorker(({ isPreview, mode }) => ({
			name: `${isPreview ? "preview" : "non-preview"}-${mode}`,
			compatibilityDate,
			env: {
				TARGET: bindings.text(isPreview ? "preview" : "non-preview"),
			},
		}));
		const config = defineConfig({ worker });

		const preview = await resolveAndParseConfig(config, {
			isPreview: true,
			mode: "staging",
		});
		const nonPreview = await resolveAndParseConfig(config, {
			isPreview: false,
			mode: "staging",
		});

		expect(preview.success && preview.data.worker).toMatchObject({
			name: "preview-staging",
			env: { TARGET: { value: "preview" } },
		});
		expect(nonPreview.success && nonPreview.data.worker).toMatchObject({
			name: "non-preview-staging",
			env: { TARGET: { value: "non-preview" } },
		});
	});

	it("resolves a project with defined and inline resources", async ({
		expect,
	}) => {
		const processor = defineContainer(
			Promise.resolve({
				name: "processor",
				image: { dockerfile: "./Dockerfile" },
			})
		);
		const worker = defineWorker(async (ctx) => ({
			name: `web-${ctx.mode}`,
			compatibilityDate,
			exports: {
				Processor: workerExports.durableObject({
					storage: "sqlite",
					container: processor,
				}),
			},
		}));
		const sidecar = defineContainer({
			name: "sidecar",
			image: { reference: "registry.example.com/sidecar:latest" },
		});
		const config = defineConfig((ctx) => ({
			accountId: `account-${ctx.mode}`,
			complianceRegion: "public" as const,
			worker,
			containers: [processor, sidecar],
		}));

		const result = await resolveAndParseConfig(config, {
			isPreview: false,
			mode: "development",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toMatchObject({
				accountId: "account-development",
				complianceRegion: "public",
				worker: {
					name: "web-development",
					exports: { Processor: { container: "processor" } },
				},
				containers: [{ name: "processor" }, { name: "sidecar" }],
			});
		}
	});

	it("accepts an inline Worker and defaults containers to an empty array", async ({
		expect,
	}) => {
		const result = await resolveAndParseConfig(
			{
				worker: { name: "web", compatibilityDate },
			},
			{ isPreview: false, mode: undefined }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.worker?.name).toBe("web");
			expect(result.data.containers).toEqual([]);
		}
	});

	it("converts a module entrypoint to its string specifier before parsing", async ({
		expect,
	}) => {
		const result = await resolveAndParseConfig(
			{
				worker: {
					name: "web",
					compatibilityDate,
					entrypoint: { default: "./src/index.ts" },
				},
			},
			{ isPreview: false, mode: undefined }
		);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.worker?.entrypoint).toBe("./src/index.ts");
		}
	});

	it("accepts settings without a Worker", async ({ expect }) => {
		const result = await resolveAndParseConfig(
			{ accountId: "account-id", complianceRegion: "public" },
			{ isPreview: false, mode: undefined }
		);

		expect(result).toEqual({
			success: true,
			data: {
				accountId: "account-id",
				complianceRegion: "public",
				containers: [],
			},
		});
	});

	it("resolves a user-authored Worker factory once by identity", async ({
		expect,
	}) => {
		const externalFactory = vi.fn((ctx: ConfigContext) => ({
			name: `jobs-${ctx.mode}`,
			compatibilityDate,
		}));
		const config = defineConfig({
			worker: defineWorker({
				name: "web",
				compatibilityDate,
				env: {
					FIRST: bindings.worker({ worker: externalFactory }),
					SECOND: bindings.worker({ worker: externalFactory }),
				},
			}),
		});

		const ctx = { isPreview: false, mode: "test" };
		const result = await resolveAndParseConfig(config, ctx);

		expect(result.success).toBe(true);
		expect(externalFactory).toHaveBeenCalledOnce();
		expect(externalFactory).toHaveBeenCalledWith(ctx);
		if (result.success) {
			expect(result.data.worker?.env).toMatchObject({
				FIRST: { worker: "jobs-test" },
				SECOND: { worker: "jobs-test" },
			});
		}
	});

	it("resolves a Worker reference in a Workflow binding", async ({
		expect,
	}) => {
		const workflowWorker = defineWorker({
			name: "workflow-worker",
			compatibilityDate,
			exports: {
				GreetingWorkflow: workerExports.workflow({ name: "greeting" }),
			},
		});
		const config = defineConfig({
			worker: defineWorker({
				name: "web",
				compatibilityDate,
				env: {
					GREETING: bindings.workflow({
						name: "greeting",
						worker: workflowWorker,
						exportName: "GreetingWorkflow",
					}),
				},
			}),
		});

		const result = await resolveAndParseConfig(config, {
			isPreview: false,
			mode: undefined,
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.worker?.env).toMatchObject({
				GREETING: {
					type: "workflow",
					name: "greeting",
					worker: "workflow-worker",
					exportName: "GreetingWorkflow",
				},
			});
		}
	});

	it("allows a cross-project Worker factory to use an explicit context", async ({
		expect,
	}) => {
		const externalFactory = vi.fn((ctx: ConfigContext) => ({
			name: `external-${ctx.mode}`,
			compatibilityDate,
		}));
		const external = defineWorker(externalFactory);
		const config = defineConfig(async () => {
			const productionExternal = await external({
				isPreview: false,
				mode: "production",
			});
			return {
				worker: {
					name: "web",
					compatibilityDate,
					env: {
						EXTERNAL: bindings.worker({ worker: productionExternal }),
					},
				},
			};
		});

		const result = await resolveAndParseConfig(config, {
			isPreview: false,
			mode: "development",
		});

		expect(result.success).toBe(true);
		expect(externalFactory).toHaveBeenCalledOnce();
		expect(externalFactory).toHaveBeenCalledWith({
			isPreview: false,
			mode: "production",
		});
		if (result.success) {
			expect(result.data.worker?.env).toMatchObject({
				EXTERNAL: { worker: "external-production" },
			});
		}
	});

	it("requires referenced Containers to belong to the project", async ({
		expect,
	}) => {
		const processor = defineContainer({
			name: "processor",
			image: { dockerfile: "./Dockerfile" },
		});
		const worker = defineWorker({
			name: "web",
			compatibilityDate,
			exports: {
				Processor: workerExports.durableObject({
					storage: "sqlite",
					container: processor,
				}),
			},
		});

		const result = await resolveAndParseConfig(defineConfig({ worker }), {
			isPreview: false,
			mode: undefined,
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toContainEqual(
				expect.objectContaining({
					path: ["worker", "exports", "Processor", "container"],
					message:
						'The referenced Container "processor" is not included in the `containers` array.',
				})
			);
		}
	});

	it("requires a referenced Container to match an item by identity", async ({
		expect,
	}) => {
		const referencedProcessor = {
			name: "processor",
			image: { dockerfile: "./Dockerfile" },
		};
		const ownedProcessor = {
			name: "processor",
			image: { dockerfile: "./Dockerfile" },
		};
		const worker = defineWorker({
			name: "web",
			compatibilityDate,
			exports: {
				Processor: workerExports.durableObject({
					storage: "sqlite",
					container: referencedProcessor,
				}),
			},
		});

		const result = await resolveAndParseConfig(
			defineConfig({ worker, containers: [ownedProcessor] }),
			{ isPreview: false, mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toContainEqual(
				expect.objectContaining({
					path: ["worker", "exports", "Processor", "container"],
					message:
						'The referenced Container "processor" is not included in the `containers` array.',
				})
			);
		}
	});

	it("reports project, Worker, and Container validation issues together", async ({
		expect,
	}) => {
		const container = defineContainer({
			name: "container",
			image: { dockerfile: "" },
		});
		const result = await resolveAndParseConfig(
			{
				accountId: 42,
				worker: { name: "", compatibilityDate: 42 },
				containers: [container],
			},
			{ isPreview: false, mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.map((issue) => issue.path)).toEqual(
				expect.arrayContaining([
					["accountId"],
					["worker", "compatibilityDate"],
					["containers", 0, "image", "dockerfile"],
				])
			);
		}
	});
});

describe("resolveAndParseConfigSettings", () => {
	it("resolves only the outer factory", async ({ expect }) => {
		const workerFactory = vi.fn(() => ({
			name: "invalid-worker",
			compatibilityDate: 42,
		}));
		const containerFactory = vi.fn(() => ({
			name: "invalid-container",
			image: { dockerfile: 42 },
		}));
		const container = defineContainer(
			containerFactory as unknown as () => {
				name: string;
				image: { dockerfile: string };
			}
		);
		const outerFactory = vi.fn(() => ({
			accountId: "account-id",
			complianceRegion: "fedramp-high" as const,
			worker: defineWorker(workerFactory as unknown as () => WorkerConfig),
			containers: [container],
		}));

		const result = await resolveAndParseConfigSettings(
			defineConfig(outerFactory),
			{ isPreview: false, mode: "production" }
		);

		expect(result).toEqual({
			success: true,
			data: {
				accountId: "account-id",
				complianceRegion: "fedramp-high",
			},
		});
		expect(outerFactory).toHaveBeenCalledOnce();
		expect(workerFactory).not.toHaveBeenCalled();
		expect(containerFactory).not.toHaveBeenCalled();
	});

	it("validates the selected account fields", async ({ expect }) => {
		const result = await resolveAndParseConfigSettings(
			{
				accountId: 42,
				worker: { invalid: true },
			},
			{ isPreview: false, mode: undefined }
		);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toHaveLength(1);
			expect(result.error.issues[0]?.path).toEqual(["accountId"]);
		}
	});
});
