import assert from "node:assert";
import { UserError } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { runCustomBuild } from "../deployment-bundle/run-custom-build";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("Custom Builds", () => {
	runInTempDir();
	mockConsoleMethods();

	it("runCustomBuild throws UserError when a command fails", async ({
		expect,
	}) => {
		try {
			await runCustomBuild(
				"/",
				"/",
				{ command: `node -e "process.exit(1)"` },
				undefined
			);
			assert(false, "Unreachable");
		} catch (e) {
			expect(e).toBeInstanceOf(UserError);
			assert(e instanceof UserError);
			expect(e.message).toMatchInlineSnapshot(
				`"Running custom build \`node -e \\"process.exit(1)\\"\` failed. There are likely more logs from your build command above."`
			);
		}
	});
});
