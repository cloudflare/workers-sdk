import { describe, expect, test } from "vitest";
import { collectCLIOutput, normalizeOutput } from "../../../cli/test-util";
import { printWelcomeMessage } from "../dialog";

describe("dialog helpers", () => {
	const std = collectCLIOutput();

	test("printWelcomeMessage", () => {
		printWelcomeMessage("0.0.0");

		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			" ╭──────────────────────────────────────────────────────────────╮
			 │ ☁️  Welcome to create-cloudflare v0.0.0!                      │
			 │ 🧡 Let's get started.                                        │
			 ╰──────────────────────────────────────────────────────────────╯
			"
		`);
	});
});
