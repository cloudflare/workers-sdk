import { describe, test } from "vitest";
import {
	fetchJson,
	isBuildAndPreviewOnWindows,
	runLongLived,
	seed,
	waitForReady,
} from "./helpers.js";

const commands = ["dev", "buildAndPreview"] as const;

describe("decorated worker entry modules", () => {
	const projectPath = seed("decorators", { pm: "pnpm" });

	describe.each(commands)('with "%s" command', (command) => {
		test.skipIf(isBuildAndPreviewOnWindows(command))(
			"can serve a Worker that uses standard decorators",
			async ({ expect }) => {
				const proc = await runLongLived("pnpm", command, projectPath);
				const url = await waitForReady(proc);

				expect(await fetchJson(url)).toEqual({ message: "ok" });
				expect(proc.stderr).not.toContain("Invalid or unexpected token");
			}
		);
	});
});
