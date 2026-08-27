import { describe, test } from "vitest";
import { getAgentsMd } from "../agents-md";

describe("getAgentsMd", () => {
	test("generates minimal live-docs guidance", ({ expect }) => {
		const agentsMd = getAgentsMd();

		expect(agentsMd).toContain("developers.cloudflare.com/llms.txt");
		expect(agentsMd).toContain("product's `llms.txt`");
		expect(agentsMd).toContain("specific Markdown pages");
		expect(agentsMd).not.toContain("## Commands");
		expect(agentsMd).not.toContain("## Product Docs");
	});
});
