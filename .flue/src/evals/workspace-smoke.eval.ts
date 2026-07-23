import { describeEval, toolCalls } from "vitest-evals";
import { createFlueAgentHarness } from "./harness";

const harness = createFlueAgentHarness({
	agentName: "workspace-smoke",
	token: process.env.FLUE_EVALS_BEARER_TOKEN,
});

describeEval("Flue workspace smoke agent", { harness }, (it) => {
	it("verifies the durable workspace", async ({ expect, run }) => {
		const result = await run("Verify the durable workspace.");

		expect(result.output.length).toBeGreaterThan(0);
		expect(toolCalls(result).map((call) => call.name)).toContain("code");
		expect(result.usage.totalTokens).toBeGreaterThan(0);
	});
});
