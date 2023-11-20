import { join } from "path";
import { FrameworkMap } from "frameworks/index";
import { retry } from "helpers/command";
import { readJSON } from "helpers/files";
import { fetch } from "undici";
import { describe, expect, test, beforeAll } from "vitest";
import { deleteProject, deleteWorker } from "../scripts/common";
import { frameworkToTest } from "./frameworkToTest";
import {
	isQuarantineMode,
	keys,
	recreateLogFolder,
	runC3,
	testDeploymentCommitMessage,
	testProjectDir,
} from "./helpers";
import type { RunnerConfig } from "./helpers";
import type { Suite, TestContext } from "vitest";

const TEST_TIMEOUT = 1000 * 60 * 5;
const LONG_TIMEOUT = 1000 * 60 * 6;

type FrameworkTestConfig = Omit<RunnerConfig, "ctx"> & {
	expectResponseToContain: string;
	testCommitMessage: boolean;
	timeout?: number;
	unsupportedPms?: string[];
	unsupportedOSs?: string[];
};

describe.concurrent(`E2E: Web frameworks`, () => {
	// These are ordered based on speed and reliability for ease of debugging
	const frameworkTests: Record<string, FrameworkTestConfig> = {
		astro: {
			expectResponseToContain: "Hello, Astronaut!",
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
		},
		docusaurus: {
			expectResponseToContain: "Dinosaurs are cool",
			unsupportedPms: ["bun"],
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
		},
		angular: {
			expectResponseToContain: "Congratulations! Your app is running.",
			unsupportedOSs: ["win32"],
			testCommitMessage: true,
		},
		gatsby: {
			expectResponseToContain: "Gatsby!",
			unsupportedPms: ["bun", "pnpm"],
			promptHandlers: [
				{
					matcher: /Would you like to use a template\?/,
					input: ["n"],
				},
			],
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
		},
		hono: {
			expectResponseToContain: "Hello Hono!",
			testCommitMessage: false,
		},
		qwik: {
			expectResponseToContain: "Welcome to Qwik",
			promptHandlers: [
				{
					matcher: /Yes looks good, finish update/,
					input: [keys.enter],
				},
			],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
		},
		remix: {
			expectResponseToContain: "Welcome to Remix",
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
		},
		next: {
			expectResponseToContain: "Create Next App",
			promptHandlers: [
				{
					matcher: /Do you want to use the next-on-pages eslint-plugin\?/,
					input: ["y"],
				},
			],
			testCommitMessage: true,
			quarantine: true,
		},
		nuxt: {
			expectResponseToContain: "Welcome to Nuxt!",
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
		},
		react: {
			expectResponseToContain: "React App",
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
		},
		solid: {
			expectResponseToContain: "Hello world",
			promptHandlers: [
				{
					matcher: /Which template do you want to use/,
					input: [keys.enter],
				},
				{
					matcher: /Server Side Rendering/,
					input: [keys.enter],
				},
				{
					matcher: /Use TypeScript/,
					input: [keys.enter],
				},
			],
			testCommitMessage: true,
			timeout: LONG_TIMEOUT,
		},
		svelte: {
			expectResponseToContain: "SvelteKit app",
			promptHandlers: [
				{
					matcher: /Which Svelte app template/,
					input: [keys.enter],
				},
				{
					matcher: /Add type checking with TypeScript/,
					input: [keys.down, keys.enter],
				},
				{
					matcher: /Select additional options/,
					input: [keys.enter],
				},
			],
			testCommitMessage: true,
			unsupportedOSs: ["win32"],
		},
		vue: {
			expectResponseToContain: "Vite App",
			testCommitMessage: true,
		},
	};

	beforeAll((ctx) => {
		recreateLogFolder(ctx as Suite);
	});

	const runCli = async (
		framework: string,
		projectPath: string,
		{ ctx, argv = [], promptHandlers = [], overrides }: RunnerConfig
	) => {
		const args = [
			projectPath,
			"--type",
			"webFramework",
			"--framework",
			framework,
			"--deploy",
			"--no-open",
			"--no-git",
		];

		args.push(...argv);

		const { output } = await runC3({
			ctx,
			argv: args,
			promptHandlers,
			outputPrefix: `[${framework}]`,
		});

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
			...(await frameworkConfig.getPackageScripts()),
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

	const runCliWithDeploy = async (
		framework: string,
		projectName: string,
		projectPath: string,
		ctx: TestContext,
		testCommitMessage: boolean
	) => {
		const { argv, overrides, promptHandlers, expectResponseToContain } =
			frameworkTests[framework];

		const { output } = await runCli(framework, projectPath, {
			ctx,
			overrides,
			promptHandlers,
			argv: [...(argv ?? [])],
		});

		// Verify deployment
		const deployedUrlRe =
			/deployment is ready at: (https:\/\/.+\.(pages|workers)\.dev)/;

		const match = output.match(deployedUrlRe);
		if (!match || !match[1]) {
			expect(false, "Couldn't find deployment url in C3 output").toBe(true);
			return;
		}

		const projectUrl = match[1];

		await retry({ times: 5 }, async () => {
			await new Promise((resolve) => setTimeout(resolve, 1000)); // wait a second
			const res = await fetch(projectUrl);
			const body = await res.text();
			if (!body.includes(expectResponseToContain)) {
				throw new Error(
					`(${framework}) Deployed page (${projectUrl}) didn't contain expected string: "${expectResponseToContain}"`
				);
			}
		});

		if (testCommitMessage) {
			await testDeploymentCommitMessage(projectName, framework);
		}
	};

	Object.keys(frameworkTests).forEach((framework) => {
		const {
			quarantine,
			timeout,
			testCommitMessage,
			unsupportedPms,
			unsupportedOSs,
		} = frameworkTests[framework];

		const quarantineModeMatch = isQuarantineMode() == (quarantine ?? false);

		// If the framework in question is being run in isolation, always run it.
		// Otherwise, only run the test if it's configured `quarantine` value matches
		// what is set in E2E_QUARANTINE
		let shouldRun = frameworkToTest
			? frameworkToTest === framework
			: quarantineModeMatch;

		// Skip if the package manager is unsupported
		shouldRun &&= !unsupportedPms?.includes(process.env.TEST_PM ?? "");
		// Skip if the OS is unsupported
		shouldRun &&= !unsupportedOSs?.includes(process.platform);
		test.runIf(shouldRun)(
			framework,
			async (ctx) => {
				const { getPath, getName, clean } = testProjectDir("pages");
				const projectPath = getPath(framework);
				const projectName = getName(framework);
				const frameworkConfig = FrameworkMap[framework];
				try {
					await runCliWithDeploy(
						framework,
						projectName,
						projectPath,
						ctx,
						testCommitMessage
					);
				} finally {
					clean(framework);
					// Cleanup the project in case we need to retry it
					if (frameworkConfig.type !== "workers") {
						await deleteProject(projectName);
					} else {
						await deleteWorker(projectName);
					}
				}
			},
			{ retry: 1, timeout: timeout || TEST_TIMEOUT }
		);
	});

	// test.skip("Hono (wrangler defaults)", async (ctx) => {
	// 	await runCli("hono", { ctx, argv: ["--wrangler-defaults"] });
	// });
});
