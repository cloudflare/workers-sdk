import { describe, it, vi } from "vitest";
import { bindings } from "../bindings";
import { resolveAndValidateConfigExports } from "../config-loader";
import { defineSettings } from "../settings-definition";
import { defineWorker } from "../worker-definition";
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

	it("collects settings and Worker validation errors", async ({ expect }) => {
		const result = await resolveAndValidateConfigExports(
			{
				default: { ...baseConfig, compatibilityDate: 42 },
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
			expect(result.data.default?.env?.AUXILIARY).toMatchObject({
				type: "worker",
				worker: "auxiliary",
			});
		}
	});

	it("uses the containing Worker's context and caches unexported references", async ({
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
			expect(result.data.default?.env).toMatchObject({
				FIRST: { worker: "auxiliary-test" },
				SECOND: { worker: "auxiliary-test" },
				COUNTER: { worker: "auxiliary-test" },
			});
		}
	});

	it("does not parse unexported Worker references", async ({ expect }) => {
		const invalidFactory = vi.fn(() => ({
			name: "referenced-only",
			compatibilityDate: undefined,
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
			expect(result.data.default?.env).toMatchObject({
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
			expect(result.data.default?.env?.EXTERNAL).toMatchObject({
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
			expect(result.data.default?.env?.SECOND).toMatchObject({
				worker: "second",
			});
			expect(result.data.second?.env?.FIRST).toMatchObject({
				worker: "first",
			});
		}
	});

	it("parses an exported referenced Worker once", async ({ expect }) => {
		const invalidFactory = vi.fn(() => ({
			name: "invalid",
			compatibilityDate: undefined,
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

describe("defineWorker", () => {
	it("returns ordinary config values without binding methods", async ({
		expect,
	}) => {
		const objectWorker = defineWorker({
			name: "object",
			compatibilityDate,
		});
		const functionWorker = defineWorker(() => ({
			name: "function",
			compatibilityDate,
		}));
		const promiseWorker = defineWorker(
			Promise.resolve({ name: "promise", compatibilityDate })
		);

		expect(objectWorker).toEqual({
			type: "worker",
			name: "object",
			compatibilityDate,
		});
		expect("durableObject" in objectWorker).toBe(false);
		expect(typeof functionWorker).toBe("function");
		expect(await functionWorker({ mode: undefined })).toMatchObject({
			type: "worker",
			name: "function",
		});
		expect(await promiseWorker).toMatchObject({
			type: "worker",
			name: "promise",
		});
	});
});

describe("defineSettings", () => {
	it("returns ordinary config values", async ({ expect }) => {
		const objectSettings = defineSettings({ accountId: "object-account" });
		const functionSettings = defineSettings((ctx: ConfigContext) => ({
			accountId: ctx.mode,
		}));
		const promiseSettings = defineSettings(
			Promise.resolve({ accountId: "promise-account" })
		);

		expect(objectSettings).toEqual({
			type: "settings",
			accountId: "object-account",
		});
		expect(typeof functionSettings).toBe("function");
		expect(await functionSettings({ mode: "function-account" })).toEqual({
			type: "settings",
			accountId: "function-account",
		});
		expect(await promiseSettings).toEqual({
			type: "settings",
			accountId: "promise-account",
		});
	});
});
