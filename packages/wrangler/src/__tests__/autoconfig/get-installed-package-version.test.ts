import { join } from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import {
	getInstalledPackageVersion,
	getPackageJsonDependencyVersion,
	hasPackageJsonDependency,
} from "../../autoconfig/frameworks/utils/packages";
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

	test("can ignore packages installed outside the project path", async ({
		expect,
	}) => {
		await seed({
			"app/package.json": JSON.stringify({ name: "app" }),
			"node_modules/vite/package.json": JSON.stringify({
				name: "vite",
				version: "8.0.13",
				main: "index.js",
			}),
			"node_modules/vite/index.js": "console.log(1)",
		});

		const appPath = join(process.cwd(), "app");

		expect(getInstalledPackageVersion("vite", appPath)).toBe("8.0.13");
		expect(
			getInstalledPackageVersion("vite", appPath, {
				stopAtProjectPath: true,
			})
		).toBeUndefined();
	});

	test("gets package.json dependency versions", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({
				dependencies: {
					vite: "^8.0.12",
				},
				devDependencies: {
					astro: "~5.1",
				},
			}),
		});

		expect(getPackageJsonDependencyVersion("vite", process.cwd())).toBe(
			"8.0.12"
		);
		expect(getPackageJsonDependencyVersion("astro", process.cwd())).toBe(
			"5.1.0"
		);
		expect(hasPackageJsonDependency("vite", process.cwd())).toBe(true);
	});

	test("does not treat peerDependencies as application dependencies", async ({
		expect,
	}) => {
		await seed({
			"package.json": JSON.stringify({
				peerDependencies: {
					vite: "^8.0.12",
				},
			}),
		});

		expect(
			getPackageJsonDependencyVersion("vite", process.cwd())
		).toBeUndefined();
		expect(hasPackageJsonDependency("vite", process.cwd())).toBe(false);
	});
});
