import { InputWorkerSchema } from "@cloudflare/config";
import { describe, test } from "vitest";
import { customizeWranglerWorkerConfig } from "../wrangler-config";

function workerConfig() {
	return InputWorkerSchema.parse({
		name: "entry-worker",
		entrypoint: "./src/index.ts",
		compatibilityDate: "2026-04-01",
		compatibilityFlags: ["global_fetch_strictly_public"],
		env: {
			MESSAGE: { type: "text", value: "hello" },
			LOCAL: {
				type: "durable-object",
				worker: "entry-worker",
				exportName: "Local",
			},
			EXTERNAL: {
				type: "durable-object",
				worker: "other-worker",
				exportName: "External",
			},
		},
		exports: { Local: { type: "durable-object", storage: "sqlite" } },
		observability: { enabled: true },
	});
}

describe("Wrangler Worker customizers", () => {
	test("preserves native configuration and isolates in-place mutations", ({
		expect,
	}) => {
		const worker = workerConfig();
		const original = structuredClone(worker);
		const result = customizeWranglerWorkerConfig(worker, (config) => {
			expect(config.durable_objects.bindings).toEqual([
				{ name: "LOCAL", class_name: "Local" },
				{
					name: "EXTERNAL",
					class_name: "External",
					script_name: "other-worker",
				},
			]);
			config.main = "virtual:entry";
			config.compatibility_flags.push("nodejs_compat");
		});

		expect(result).toEqual({
			...original,
			entrypoint: "virtual:entry",
			compatibilityFlags: ["global_fetch_strictly_public", "nodejs_compat"],
		});
		expect(worker).toEqual(original);
	});

	test("merges returned partial configuration", ({ expect }) => {
		const worker = workerConfig();
		const result = customizeWranglerWorkerConfig(worker, () => ({
			main: "virtual:entry",
			compatibility_date: "2026-05-01",
			compatibility_flags: ["nodejs_compat"],
		}));

		expect(result).toEqual({
			...worker,
			entrypoint: "virtual:entry",
			compatibilityDate: "2026-05-01",
			compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
		});
	});

	test("supports partial object customizers", ({ expect }) => {
		const worker = workerConfig();

		expect(
			customizeWranglerWorkerConfig(worker, { main: "virtual:entry" })
		).toEqual({ ...worker, entrypoint: "virtual:entry" });
	});

	test("removes Durable Object bindings without changing native exports", ({
		expect,
	}) => {
		const worker = workerConfig();
		const result = customizeWranglerWorkerConfig(worker, (config) => {
			config.durable_objects.bindings = [];
		});

		expect(result).toEqual({
			...worker,
			env: { MESSAGE: { type: "text", value: "hello" } },
		});
	});

	test.for(["MESSAGE", "LOCAL"])(
		"rejects conflicting or duplicate binding names: %s",
		(name, { expect }) => {
			expect(() =>
				customizeWranglerWorkerConfig(workerConfig(), (config) => {
					config.durable_objects.bindings.push({ name, class_name: "Added" });
				})
			).toThrow(`binding "${name}" conflicts with another binding`);
		}
	);

	test("rejects unsupported Worker fields rather than dropping them", ({
		expect,
	}) => {
		expect(() =>
			customizeWranglerWorkerConfig(workerConfig(), () => ({
				main: "virtual:entry",
				vars: { MESSAGE: "would-be-lost" },
			}))
		).toThrow(/Unrecognized key:.*vars/);
	});

	test("rejects Wrangler service environments rather than losing them", ({
		expect,
	}) => {
		expect(() =>
			customizeWranglerWorkerConfig(workerConfig(), () => ({
				durable_objects: {
					bindings: [
						{
							name: "ADDED",
							class_name: "Added",
							script_name: "other-worker",
							environment: "staging",
						},
					],
				},
			}))
		).toThrow(/Unrecognized key:.*environment/);
	});

	test("validates JavaScript customizer mutations with the schema", ({
		expect,
	}) => {
		expect(() =>
			customizeWranglerWorkerConfig(workerConfig(), (config) => {
				Object.assign(config, { main: 123 });
			})
		).toThrow("expected string, received number");
	});

	test("propagates customizer errors without mutating native configuration", ({
		expect,
	}) => {
		const worker = workerConfig();
		const original = structuredClone(worker);

		expect(() =>
			customizeWranglerWorkerConfig(worker, (config) => {
				config.compatibility_flags.push("nodejs_compat");
				throw new Error("customizer failed");
			})
		).toThrow("customizer failed");
		expect(worker).toEqual(original);
	});
});
