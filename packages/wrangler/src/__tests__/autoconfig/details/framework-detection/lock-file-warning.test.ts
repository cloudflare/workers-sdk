import { seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../../autoconfig/details/framework-detection";
import { mockConsoleMethods } from "../../../helpers/mock-console";
import { runInTempDir } from "../../../helpers/run-in-tmp";

const noLockFileWarning =
	"No lock file has been detected in the current working directory. This might indicate that the project is part of a workspace.";

describe("detectFramework() / lock file warning", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("warns when no lock file is detected", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
		});

		await detectFramework(process.cwd());

		expect(std.warn).toContain(noLockFileWarning);
	});

	it("does not warn for static projects without a lock file", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
		});

		await detectFramework(process.cwd());

		expect(std.warn).not.toContain(noLockFileWarning);
	});

	it("does not warn when a lock file exists", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		await detectFramework(process.cwd());

		expect(std.warn).not.toContain(noLockFileWarning);
	});
});
