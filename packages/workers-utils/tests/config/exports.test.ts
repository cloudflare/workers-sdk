import { describe, test } from "vitest";
import { partitionExports } from "../../src/config/exports";
import type { Exports } from "../../src/config/environment";

describe("partitionExports", () => {
	test("returns empty partitions when exports are undefined", ({ expect }) => {
		expect(partitionExports(undefined)).toEqual({
			"durable-object": {},
			worker: {},
		});
	});

	test("returns empty partitions when exports are empty", ({ expect }) => {
		expect(partitionExports({})).toEqual({
			"durable-object": {},
			worker: {},
		});
	});

	test("partitions Durable Object and Worker exports by type", ({ expect }) => {
		const exports: Exports = {
			Counter: { type: "durable-object", storage: "sqlite" },
			Admin: { type: "worker", cache: { enabled: true } },
		};

		expect(partitionExports(exports)).toEqual({
			"durable-object": {
				Counter: { type: "durable-object", storage: "sqlite" },
			},
			worker: {
				Admin: { type: "worker", cache: { enabled: true } },
			},
		});
	});
});
