import { readBuildOutput } from "@cloudflare/build-output-utils";
import { describe, test } from "vitest";
import {
	isBuildAndPreviewOnWindows,
	runLongLived,
	seed,
	waitForReady,
} from "./helpers.js";

// The fixture is a `create-react-router` 8.5.1 project as configured by autoconfig for `cf`
describe("React Router", () => {
	const projectPath = seed("react-router", { pm: "pnpm" });

	test.skipIf(isBuildAndPreviewOnWindows("buildAndPreview"))(
		"builds Build Output that serves server-rendered pages",
		async ({ expect }) => {
			const proc = await runLongLived("pnpm", "buildAndPreview", projectPath);
			const url = await waitForReady(proc);

			const response = await fetch(url);
			expect(response.status).toBe(200);
			expect(await response.text()).toContain(
				"<title>New React Router App</title>"
			);

			const { workers } = await readBuildOutput(projectPath);
			expect(workers.default.config.manifest?.mainModule).toBe("index.js");
		}
	);
});
