import { describe, it } from "vitest";
import { convertToWranglerConfig } from "../convert";
import { InputWorkerSchema, OutputWorkerSchema } from "../schema";

const worker = { name: "counter", compatibilityDate: "2026-06-01" };

describe.each([
	["input", InputWorkerSchema],
	["output", OutputWorkerSchema],
] as const)("%s Durable Object code updates", (_name, schema) => {
	it.for([
		{ mode: "immediate" },
		{ mode: "deferred" },
		{ mode: "deferred", maxDelay: 0 },
		{ mode: "deferred", maxDelay: 0.001 },
		{ mode: "deferred", maxDelay: 65536.001 },
		{ mode: "deferred", maxDelay: 86400 },
	])("accepts %j", (codeUpdateStrategy, { expect }) => {
		const durableObjects = { codeUpdateStrategy };
		expect(schema.parse({ ...worker, durableObjects }).durableObjects).toEqual(
			durableObjects
		);
	});

	it.for([
		{ mode: "other" },
		{ mode: "immediate", maxDelay: 30 },
		{ mode: "deferred", maxDelay: -1 },
		{ mode: "deferred", maxDelay: 86400.001 },
		{ mode: "deferred", maxDelay: 0.0001 },
		{ mode: "deferred", maxDelay: "300" },
		{ mode: "deferred", maxDelay: Infinity },
		{ mode: "deferred", maxDelay: NaN },
	])("rejects %j", (codeUpdateStrategy, { expect }) => {
		expect(
			schema.safeParse({
				...worker,
				durableObjects: { codeUpdateStrategy },
			}).success
		).toBe(false);
	});
});

describe("Durable Object update conversion", () => {
	it.for([
		[{ mode: "immediate" }, { mode: "immediate" }],
		[{ mode: "deferred" }, { mode: "deferred" }],
		[
			{ mode: "deferred", maxDelay: 0 },
			{ mode: "deferred", max_delay: 0 },
		],
		[
			{ mode: "deferred", maxDelay: 30.001 },
			{ mode: "deferred", max_delay: 30.001 },
		],
	] as const)("converts %j", ([codeUpdateStrategy, expected], { expect }) => {
		const parsed = InputWorkerSchema.parse({
			...worker,
			durableObjects: { codeUpdateStrategy },
			env: {
				COUNTER: {
					type: "durable-object",
					worker: "counter",
					exportName: "Counter",
				},
			},
		});
		const result = convertToWranglerConfig({ worker: parsed, containers: [] });
		expect(result.durable_objects).toEqual({
			bindings: [
				{ name: "COUNTER", class_name: "Counter", script_name: "counter" },
			],
			code_update_strategy: expected,
		});
	});

	it("configures updates without a namespace binding", ({ expect }) => {
		const parsed = InputWorkerSchema.parse({
			...worker,
			durableObjects: { codeUpdateStrategy: { mode: "deferred" } },
		});
		expect(
			convertToWranglerConfig({ worker: parsed, containers: [] })
				.durable_objects
		).toEqual({ code_update_strategy: { mode: "deferred" } });
	});

	it("leaves an omitted strategy unset", ({ expect }) => {
		expect(
			convertToWranglerConfig({
				worker: InputWorkerSchema.parse(worker),
				containers: [],
			}).durable_objects
		).toBeUndefined();
	});
});
