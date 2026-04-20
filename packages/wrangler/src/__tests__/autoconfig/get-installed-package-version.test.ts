import { seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { getInstalledPackageVersion } from "../../autoconfig/frameworks/utils/packages";
import { runInTempDir } from "../helpers/run-in-tmp";

describe("getInstalledPackageVersion()", () => {
	runInTempDir();
	test("happy path", async ({ expect }) => {
		await seed({
			"node_modules/react-router/package.json": JSON.stringify({
				name: "react-router",
				version: "1.2.3",
				main: "index.js",
			}),
			"node_modules/react-router/index.js": "console.log(1)",
		});
		expect(getInstalledPackageVersion("react-router", process.cwd())).toBe(
			"1.2.3"
		);
	});

	test("no node_modules", async ({ expect }) => {
		expect(
			getInstalledPackageVersion("react-router", process.cwd())
		).toBeUndefined();
	});
});
