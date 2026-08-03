import { afterEach, describe, test } from "vitest";
import { isAgentSession } from "../detect-agent";

describe("isAgentSession", () => {
	const saved = { ...process.env };

	afterEach(() => {
		process.env = { ...saved };
	});

	test("detects a headless agent from the environment", ({ expect }) => {
		process.env = { CLAUDECODE: "1" };
		expect(isAgentSession()).toBe(true);
	});

	test("treats a hybrid terminal as interactive, not an agent", ({
		expect,
	}) => {
		// Warp embeds agentic features but has a human at the keyboard. The
		// library's isAgent() reports hybrid as an agent, so this guards the
		// stricter check.
		process.env = { TERM_PROGRAM: "WarpTerminal" };
		expect(isAgentSession()).toBe(false);
	});

	test("is false in a plain shell", ({ expect }) => {
		process.env = {};
		expect(isAgentSession()).toBe(false);
	});
});
