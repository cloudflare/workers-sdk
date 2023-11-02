import { join } from "path";
import {
	describe,
	expect,
	test,
	afterEach,
	beforeEach,
	beforeAll,
} from "vitest";
import { frameworkToTest } from "./frameworkToTest";
import {
	isQuarantineMode,
	recreateLogFolder,
	runC3,
	testProjectDir,
} from "./helpers";
import type { Suite, TestContext } from "vitest";

/*
Areas for future improvement:
- Make these actually e2e by verifying that deployment works
*/

// Note: skipIf(frameworkToTest) makes it so that all the worker tests are
//       skipped in case we are testing a specific framework
//       (since no worker template implements a framework application)
describe.skipIf(frameworkToTest || isQuarantineMode())(
	"E2E: Workers templates",
	() => {
		const { getPath, clean } = testProjectDir("workers");

		beforeAll((ctx) => {
			recreateLogFolder(ctx as Suite);
		});

		beforeEach((ctx) => {
			const template = ctx.meta.name;
			clean(template);
		});

		afterEach((ctx) => {
			const template = ctx.meta.name;
			clean(template);
		});

		const runCli = async (template: string, ctx: TestContext) => {
			const projectPath = getPath(template.toLowerCase());

			const argv = [
				projectPath,
				"--type",
				template,
				"--no-ts",
				"--no-deploy",
				"--no-git",
				"--wrangler-defaults",
			];

			await runC3({ ctx, argv });

			// Relevant project files should have been created
			expect(projectPath).toBeTruthy();

			const gitignorePath = join(projectPath, ".gitignore");
			expect(gitignorePath).toBeTruthy();

			const pkgJsonPath = join(projectPath, "package.json");
			expect(pkgJsonPath).toBeTruthy();

			const wranglerPath = join(projectPath, "node_modules/wrangler");
			expect(wranglerPath).toBeTruthy();
		};

		describe.each([
			"hello-world",
			"common",
			"chatgptPlugin",
			"queues",
			"scheduled",
			"openapi",
		])("%s", async (name) => {
			test(name, async (ctx) => {
				await runCli(name, ctx);
			});
		});
	}
);
