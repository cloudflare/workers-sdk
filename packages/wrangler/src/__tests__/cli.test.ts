import { grayBar, leftT, spinner } from "@cloudflare/cli/interactive";
import { describe, test } from "vitest";
import { collectCLIOutput } from "./helpers/collect-cli-output";
import { useMockIsTTY } from "./helpers/mock-istty";

describe("cli", () => {
	describe("spinner", () => {
		const std = collectCLIOutput();
		const { setIsTTY } = useMockIsTTY();
		test("does not animate when stdout is not a TTY", async ({ expect }) => {
			setIsTTY(false);
			const s = spinner();
			const startMsg = "Start message";
			s.start(startMsg);
			const stopMsg = "Stop message";
			s.stop(stopMsg);
			expect(std.out).toEqual(
				`${leftT} ${startMsg}\n${grayBar} ${stopMsg}\n${grayBar}\n`
			);
		});
	});
});
