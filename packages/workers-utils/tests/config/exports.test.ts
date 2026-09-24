import { describe, test } from "vitest";
import { partitionExports } from "../../src/config/exports";
import type { Exports } from "../../src/config/environment";

describe("partitionExports", () => {
	test("returns empty partitions when exports are undefined", ({ expect }) => {
		expect(partitionExports(undefined)).toEqual({
			"durable-object": {},
			worker: {},
			workflow: {},
		});
	});

	test("returns empty partitions when exports are empty", ({ expect }) => {
		expect(partitionExports({})).toEqual({
			"durable-object": {},
			worker: {},
			workflow: {},
		});
	});

	test("partitions Durable Object, Worker, and Workflow exports by type", ({
		expect,
	}) => {
		const exports: Exports = {
			Counter: { type: "durable-object", storage: "sqlite" },
			Admin: { type: "worker", cache: { enabled: true } },
			GreetingWorkflow: { type: "workflow", name: "greeting" },
			BatchWorkflow: {
				type: "workflow",
				name: "batch",
				limits: { steps: 10 },
			},
		};

		expect(partitionExports(exports)).toEqual({
			"durable-object": {
				Counter: { type: "durable-object", storage: "sqlite" },
			},
			worker: {
				Admin: { type: "worker", cache: { enabled: true } },
			},
			workflow: {
				GreetingWorkflow: { type: "workflow", name: "greeting" },
				BatchWorkflow: {
					type: "workflow",
					name: "batch",
					limits: { steps: 10 },
				},
			},
		});
	});
});
