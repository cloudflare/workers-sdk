import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { getInstalledPackageVersion } from "../src/frameworks/utils/packages";

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

	test("aliased package returns the bundled version of the requested package", async ({
		expect,
	}) => {
		// vite+ installs `@voidzero-dev/vite-plus-core` under the `vite` alias, so
		// the resolved package.json has a different `name` and its own `version`.
		await seed({
			"node_modules/vite/package.json": JSON.stringify({
				name: "@voidzero-dev/vite-plus-core",
				version: "0.2.2",
				bundledVersions: {
					vite: "8.1.2",
					rolldown: "1.0.0",
					tsdown: "0.15.0",
				},
				main: "index.js",
			}),
			"node_modules/vite/index.js": "console.log(1)",
		});
		expect(getInstalledPackageVersion("vite", process.cwd())).toBe("8.1.2");
	});

	test("aliased package without a matching bundled version falls back to its own version", async ({
		expect,
	}) => {
		await seed({
			"node_modules/vite/package.json": JSON.stringify({
				name: "@voidzero-dev/vite-plus-core",
				version: "0.2.2",
				bundledVersions: {
					rolldown: "1.0.0",
				},
				main: "index.js",
			}),
			"node_modules/vite/index.js": "console.log(1)",
		});
		expect(getInstalledPackageVersion("vite", process.cwd())).toBe("0.2.2");
	});

	test("package whose name matches ignores bundledVersions and returns its own version", async ({
		expect,
	}) => {
		await seed({
			"node_modules/vite/package.json": JSON.stringify({
				name: "vite",
				version: "6.3.0",
				bundledVersions: {
					vite: "8.1.2",
				},
				main: "index.js",
			}),
			"node_modules/vite/index.js": "console.log(1)",
		});
		expect(getInstalledPackageVersion("vite", process.cwd())).toBe("6.3.0");
	});
});
