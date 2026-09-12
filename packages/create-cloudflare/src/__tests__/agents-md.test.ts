import { describe, test } from "vitest";
import { getAgentsMd } from "../agents-md";

describe("getAgentsMd", () => {
	test("points to the live llms.txt", ({ expect }) => {
		const agentsMd = getAgentsMd();

		expect(agentsMd).toContain("https://developers.cloudflare.com/llms.txt");
	});

	test("doesn't contain direct Wrangler instructions", ({ expect }) => {
		const agentsMd = getAgentsMd();

		expect(agentsMd).not.toContain("npx wrangler");
	});
});
