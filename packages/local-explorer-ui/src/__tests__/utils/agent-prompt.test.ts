import { describe, test, vi } from "vitest";
import {
	copyTextToClipboard,
	createLocalExplorerPrompt,
	getLocalExplorerApiEndpoint,
} from "../../utils/agent-prompt";

describe("llm-prompt utils", () => {
	test("builds api endpoint from origin and api path", ({ expect }) => {
		expect(
			getLocalExplorerApiEndpoint(
				"http://localhost:8787",
				"/cdn-cgi/explorer/api"
			)
		).toBe("http://localhost:8787/cdn-cgi/explorer/api");
	});

	test("generates prompt text with resolved api endpoint", ({ expect }) => {
		const prompt = createLocalExplorerPrompt(
			"http://localhost:8787/cdn-cgi/explorer/api"
		);

		expect(prompt).toContain(
			"API endpoint: http://localhost:8787/cdn-cgi/explorer/api."
		);
		expect(prompt).toContain(
			"Fetch the OpenAPI schema from http://localhost:8787/cdn-cgi/explorer/api"
		);
	});

	test("copies prompt text to clipboard", async ({ expect }) => {
		const writeText = vi.fn().mockResolvedValue(undefined);

		await copyTextToClipboard("prompt text", { writeText });

		expect(writeText).toHaveBeenCalledOnce();
		expect(writeText).toHaveBeenCalledWith("prompt text");
	});
});
