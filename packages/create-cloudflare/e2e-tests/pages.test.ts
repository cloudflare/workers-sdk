import { existsSync, mkdtempSync, realpathSync, rmSync } from "fs";
import crypto from "node:crypto";
import { tmpdir } from "os";
import { join } from "path";
import { FrameworkMap } from "frameworks/index";
import { readJSON } from "helpers/files";
import { fetch } from "undici";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
// import { keys, runC3 } from "./helpers";
import { runC3 } from "./helpers";
import type { RunnerConfig } from "./helpers";

export const TEST_PREFIX = "c3-e2e-";

/*
Areas for future improvement:
- Add support for frameworks with global installs (like docusaurus, gatsby, etc)
*/

type FrameworkTestConfig = RunnerConfig & {
	expectResponseToContain: string;
};

describe(`E2E: Web frameworks`, () => {
	const tmpDirPath = realpathSync(mkdtempSync(join(tmpdir(), "c3-tests")));
	const baseProjectName = `c3-e2e-${crypto.randomBytes(3).toString("hex")}`;

	const getProjectName = (framework: string) =>
		`${baseProjectName}-${framework}`;
	const getProjectPath = (framework: string) =>
		join(tmpDirPath, getProjectName(framework));

	beforeEach((ctx) => {
		const framework = ctx.meta.name;
		const projectPath = getProjectPath(framework);
		rmSync(projectPath, { recursive: true, force: true });
	});

	afterEach((ctx) => {
		const framework = ctx.meta.name;
		const projectPath = getProjectPath(framework);

		if (existsSync(projectPath)) {
			rmSync(projectPath, { recursive: true });
		}
	});

	const runCli = async (
		framework: string,
		{ argv = [], promptHandlers = [], overrides }: RunnerConfig
	) => {
		const projectPath = getProjectPath(framework);

		const args = [
			projectPath,
			"--type",
			"webFramework",
			"--framework",
			framework,
			"--deploy",
			"--no-open",
		];

		args.push(...argv);

		const { output } = await runC3({ argv: args, promptHandlers });

		// Relevant project files should have been created
		expect(projectPath).toExist();
		const pkgJsonPath = join(projectPath, "package.json");
		expect(pkgJsonPath).toExist();

		// Wrangler should be installed
		const wranglerPath = join(projectPath, "node_modules/wrangler");
		expect(wranglerPath).toExist();

		// Verify package scripts
		const frameworkConfig = FrameworkMap[framework];

		const frameworkTargetPackageScripts = {
			...frameworkConfig.packageScripts,
		} as Record<string, string>;

		if (overrides && overrides.packageScripts) {
			// override packageScripts with testing provided scripts
			Object.entries(overrides.packageScripts).forEach(([target, cmd]) => {
				frameworkTargetPackageScripts[target] = cmd;
			});
		}

		const pkgJson = readJSON(pkgJsonPath);
		Object.entries(frameworkTargetPackageScripts).forEach(([target, cmd]) => {
			expect(pkgJson.scripts[target]).toEqual(cmd);
		});

		return { output };
	};

	const runCliWithDeploy = async (framework: string) => {
		const projectName = `${baseProjectName}-${framework}`;

		const { argv, overrides, promptHandlers, expectResponseToContain } =
			frameworkTests[framework];

		await runCli(framework, {
			overrides,
			promptHandlers,
			argv: [...(argv ?? []), "--deploy", "--no-git"],
		});

		// Verify deployment
		const projectUrl = `https://${projectName}.pages.dev/`;

		const res = await fetch(projectUrl);
		expect(res.status).toBe(200);

		const body = await res.text();
		expect(
			body,
			`(${framework}) Deployed page (${projectUrl}) didn't contain expected string: "${expectResponseToContain}"`
		).toContain(expectResponseToContain);
	};

	// These are ordered based on speed and reliability for ease of debugging
	const frameworkTests: Record<string, FrameworkTestConfig> = {
		// astro: {
		// 	expectResponseToContain: "Hello, Astronaut!",
		// },
		hono: {
			expectResponseToContain: "/api/hello",
		},
		// qwik: {
		// 	expectResponseToContain: "Welcome to Qwik",
		// 	promptHandlers: [
		// 		{
		// 			matcher: /Yes looks good, finish update/,
		// 			input: [keys.enter],
		// 		},
		// 	],
		// },
		// remix: {
		// 	expectResponseToContain: "Welcome to Remix",
		// },
		// next: {
		// 	expectResponseToContain: "Create Next App",
		// 	promptHandlers: [
		// 		{
		// 			matcher: /Do you want to use the next-on-pages eslint-plugin\?/,
		// 			input: ["y"],
		// 		},
		// 	],
		// },
		// nuxt: {
		// 	expectResponseToContain: "Welcome to Nuxt!",
		// 	overrides: {
		// 		packageScripts: {
		// 			build: "NITRO_PRESET=cloudflare-pages nuxt build",
		// 		},
		// 	},
		// },
		// react: {
		// 	expectResponseToContain: "React App",
		// },
		// solid: {
		// 	expectResponseToContain: "Hello world",
		// 	promptHandlers: [
		// 		{
		// 			matcher: /Which template do you want to use/,
		// 			input: [keys.enter],
		// 		},
		// 		{
		// 			matcher: /Server Side Rendering/,
		// 			input: [keys.enter],
		// 		},
		// 		{
		// 			matcher: /Use TypeScript/,
		// 			input: [keys.enter],
		// 		},
		// 	],
		// },
		// svelte: {
		// 	expectResponseToContain: "SvelteKit app",
		// 	promptHandlers: [
		// 		{
		// 			matcher: /Which Svelte app template/,
		// 			input: [keys.enter],
		// 		},
		// 		{
		// 			matcher: /Add type checking with TypeScript/,
		// 			input: [keys.down, keys.enter],
		// 		},
		// 		{
		// 			matcher: /Select additional options/,
		// 			input: [keys.enter],
		// 		},
		// 	],
		// },
		// vue: {
		// 	expectResponseToContain: "Vite App",
		// },
	};

	test.concurrent.each(Object.keys(frameworkTests))(
		"%s",
		async (name) => {
			await runCliWithDeploy(name);
		}
		// DEBUG: no retries for testing
		// { retry: 3 }
	);

	test.skip("Hono (wrangler defaults)", async () => {
		await runCli("hono", { argv: ["--wrangler-defaults"] });
	});
});
