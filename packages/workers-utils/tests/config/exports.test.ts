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
			MyWorkflow: { type: "workflow", name: "my-workflow" },
		};

		expect(partitionExports(exports)).toEqual({
			"durable-object": {
				Counter: { type: "durable-object", storage: "sqlite" },
			},
			worker: {
				Admin: { type: "worker", cache: { enabled: true } },
			},
			workflow: {
				MyWorkflow: { type: "workflow", name: "my-workflow" },
			},
		});
	});
});
