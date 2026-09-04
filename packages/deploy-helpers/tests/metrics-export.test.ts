import { describe, it } from "vitest";
import { validateContainerApplicationIds } from "../src/deploy/helpers/metrics-export";

describe("validateContainerApplicationIds", () => {
	it("accepts a complete unique set", ({ expect }) => {
		expect(validateContainerApplicationIds(["app-b", "app-a"], 2)).toEqual([
			"app-b",
			"app-a",
		]);
	});

	it("accepts an empty set when no Containers are configured", ({ expect }) => {
		expect(validateContainerApplicationIds(undefined, 0)).toEqual([]);
	});

	const invalidCases: [string, unknown[] | undefined, number][] = [
		["missing IDs", undefined, 1],
		["too few IDs", ["app-a"], 2],
		["too many IDs", ["app-a", "app-b"], 1],
		["unexpected IDs", ["app-a"], 0],
		["a non-string ID", [123], 1],
		["a blank ID", [" "], 1],
		["an ID with surrounding whitespace", [" app-a"], 1],
		["duplicate IDs", ["app-a", "app-a"], 2],
	];

	for (const [description, applicationIds, expectedCount] of invalidCases) {
		it(`rejects ${description}`, ({ expect }) => {
			expect(() =>
				validateContainerApplicationIds(applicationIds, expectedCount)
			).toThrow(
				"Wrangler did not resolve a complete, unique set of Container Application IDs."
			);
		});
	}
});
