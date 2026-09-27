import { test, vi } from "vitest";
import { getJsonResponse, WAIT_FOR_OPTIONS } from "../../__test-utils__";

test("creates a Workflow with an ID", async ({ expect }) => {
	const instanceId = "workflows-test-id";

	await getJsonResponse(`/create?id=${instanceId}`);

	await vi.waitFor(async () => {
		expect(await getJsonResponse(`/get?id=${instanceId}`)).toEqual({
			status: "complete",
			__LOCAL_DEV_STEP_OUTPUTS: [
				{ output: "First step result" },
				{ output: "Second step result" },
			],
			output: "Workflow output",
		});
	}, WAIT_FOR_OPTIONS);
});
