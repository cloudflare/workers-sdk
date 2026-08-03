import { describe, test, vi } from "vitest";
import { LOCAL_EXPLORER_API_PATH } from "../../constants";
import {
	copyTextToClipboard,
	createLocalExplorerPrompt,
	getLocalExplorerApiEndpoint,
} from "../../utils/agent-prompt";

const TEST_ORIGIN = "http://localhost:8787";
const TEST_API_ENDPOINT = `${TEST_ORIGIN}${LOCAL_EXPLORER_API_PATH}`;

describe("llm-prompt utils", () => {
	test("builds api endpoint from origin and api path", ({ expect }) => {
		expect(
			getLocalExplorerApiEndpoint(TEST_ORIGIN, LOCAL_EXPLORER_API_PATH)
		).toBe(TEST_API_ENDPOINT);
	});

	test("generates prompt text with resolved api endpoint", ({ expect }) => {
		const prompt = createLocalExplorerPrompt(TEST_API_ENDPOINT);

		expect(prompt).toContain(`API endpoint: ${TEST_API_ENDPOINT}`);
		expect(prompt).toContain(
			`Fetch the OpenAPI schema from ${TEST_API_ENDPOINT}`
		);
	});

	test("copies prompt text to clipboard", async ({ expect }) => {
		const writeText = vi.fn().mockResolvedValue(undefined);

		await copyTextToClipboard("prompt text", { writeText });

		expect(writeText).toHaveBeenCalledOnce();
		expect(writeText).toHaveBeenCalledWith("prompt text");
	});
});
