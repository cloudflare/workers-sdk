import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { detectFramework } from "../../../src/details/framework-detection";
import { createMockContext } from "../../helpers/mock-context";
const noLockFileWarning =
	"No lock file has been detected in the current working directory. This might indicate that the project is part of a workspace.";

describe("detectFramework() / lock file warning", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const context = createMockContext();

	it("warns when no lock file is detected", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
		});

		await detectFramework(process.cwd(), context);

		expect(std.warn).toContain(noLockFileWarning);
	});

	it("does not warn for static projects without a lock file", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({}),
		});

		await detectFramework(process.cwd(), context);

		expect(std.warn).not.toContain(noLockFileWarning);
	});

	it("does not warn when a lock file exists", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ dependencies: { astro: "5" } }),
			"package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
		});

		await detectFramework(process.cwd(), context);

		expect(std.warn).not.toContain(noLockFileWarning);
	});
});
