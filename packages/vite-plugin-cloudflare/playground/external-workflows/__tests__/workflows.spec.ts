import { expect, test, vi } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

test("creates a Workflow with an ID", async () => {
	const instanceId = "test-id";

	expect(await getJsonResponse(`/create?id=${instanceId}`)).toEqual({
		id: instanceId,
		status: {
			status: "running",
			__LOCAL_DEV_STEP_OUTPUTS: [],
			output: null,
		},
	});

	await vi.waitFor(
		async () => {
			expect(await getJsonResponse(`/get?id=${instanceId}`)).toEqual({
				status: "running",
				__LOCAL_DEV_STEP_OUTPUTS: [{ output: "First step result" }],
				output: null,
			});
		},
		{ timeout: 5000 }
	);

	await vi.waitFor(
		async () => {
			expect(await getJsonResponse(`/get?id=${instanceId}`)).toEqual({
				status: "complete",
				__LOCAL_DEV_STEP_OUTPUTS: [
					{ output: "First step result" },
					{ output: "Second step result" },
				],
				output: "Workflow output",
			});
		},
		{ timeout: 5000 }
	);
});
