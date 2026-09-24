import { isLiveDurableObjectExport } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import { partitionExports } from "../../src/config/exports";
import type {
	DurableObjectExport,
	Exports,
} from "../../src/config/environment";

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

describe("isLiveDurableObjectExport", () => {
	test("returns true for live exports and false for tombstones", ({
		expect,
	}) => {
		const cases: [DurableObjectExport, boolean][] = [
			[{ type: "durable-object", storage: "sqlite" }, true],
			[
				{ type: "durable-object", state: "created", storage: "legacy-kv" },
				true,
			],
			[
				{
					type: "durable-object",
					state: "expecting-transfer",
					storage: "sqlite",
					transfer_from: "source-worker",
				},
				true,
			],
			[{ type: "durable-object", state: "deleted" }, false],
			[
				{ type: "durable-object", state: "renamed", renamed_to: "NewName" },
				false,
			],
			[
				{
					type: "durable-object",
					state: "transferred",
					transferred_to: "target-worker",
				},
				false,
			],
		];

		for (const [exportConfig, expected] of cases) {
			expect(isLiveDurableObjectExport(exportConfig)).toBe(expected);
		}
	});

	test("narrows a live export", ({ expect }) => {
		function getStorage(exportConfig: DurableObjectExport) {
			return isLiveDurableObjectExport(exportConfig)
				? exportConfig.storage
				: undefined;
		}

		expect(getStorage({ type: "durable-object", storage: "sqlite" })).toBe(
			"sqlite"
		);
		expect(
			getStorage({ type: "durable-object", state: "deleted" })
		).toBeUndefined();
	});
});
