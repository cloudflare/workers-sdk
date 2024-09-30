import { existsSync } from "fs";
import { cp } from "fs/promises";
import { join } from "path";
import { runCommand } from "helpers/command";
import { readFile, readToml, writeFile, writeToml } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import { beforeAll, describe, expect } from "vitest";
import { deleteProject, deleteWorker } from "../scripts/common";
import { getFrameworkMap } from "../src/templates";
import { getFrameworkToTest } from "./frameworkToTest";
import {
	getDiffsPath,
	isQuarantineMode,
	keys,
	kill,
	recreateDiffsFolder,
	recreateLogFolder,
	runC3,
	spawnWithLogging,
	test,
	testDeploymentCommitMessage,
	waitForExit,
} from "./helpers";
import type { TemplateConfig } from "../src/templates";
import type { RunnerConfig } from "./helpers";
import type { JsonMap } from "@iarna/toml";
import type { Writable } from "stream";

const TEST_TIMEOUT = 1000 * 60 * 5;
const LONG_TIMEOUT = 1000 * 60 * 10;
const TEST_PM = process.env.TEST_PM ?? "";
const NO_DEPLOY = process.env.E2E_NO_DEPLOY ?? true;
const TEST_RETRIES = process.env.E2E_RETRIES
	? parseInt(process.env.E2E_RETRIES)
	: 1;

type FrameworkTestConfig = RunnerConfig & {
	testCommitMessage: boolean;
	unsupportedPms?: string[];
	unsupportedOSs?: string[];
	verifyBuildCfTypes?: {
		outputFile: string;
		envInterfaceName: string;
	};
	verifyBuild?: {
		outputDir: string;
		script: string;
		route: string;
		expectedText: string;
	};
	flags?: string[];
};

const { name: pm, npx } = detectPackageManager();

function getFrameworkTests(opts: {
	experimental: boolean;
}): Record<string, FrameworkTestConfig> {
	if (opts.experimental) {
		return {
			next: {
				testCommitMessage: false,
				verifyBuildCfTypes: {
					outputFile: "env.d.ts",
					envInterfaceName: "CloudflareEnv",
				},
				verifyPreview: {
					route: "/test",
					expectedText: "Create Next App",
				},
				verifyDeploy: {
					route: "/",
					expectedText: "Create Next App",
				},
				unsupportedOSs: ["win32"],
			},
		};
	} else {
		// These are ordered based on speed and reliability for ease of debugging
		return {
			astro: {
				testCommitMessage: true,
				quarantine: true,
				unsupportedOSs: ["win32"],
				verifyDeploy: {
					route: "/",
					expectedText: "Hello, Astronaut!",
				},
				verifyPreview: {
					route: "/test",
					expectedText: "C3_TEST",
				},
				verifyBuild: {
					outputDir: "./dist",
					script: "build",
					route: "/test",
					expectedText: "C3_TEST",
				},
				flags: [
					"--skip-houston",
					"--no-install",
					"--no-git",
					"--template",
					"blog",
					"--typescript",
					"strict",
				],
			},
			docusaurus: {
				unsupportedPms: ["bun"],
				testCommitMessage: true,
				unsupportedOSs: ["win32"],
				timeout: LONG_TIMEOUT,
				verifyDeploy: {
					route: "/",
					expectedText: "Dinosaurs are cool",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Dinosaurs are cool",
				},
				flags: [`--package-manager`, pm],
				promptHandlers: [
					{
						matcher: /Which language do you want to use\?/,
						input: [keys.enter],
					},
				],
			},
			analog: {
				testCommitMessage: true,
				timeout: LONG_TIMEOUT,
				unsupportedOSs: ["win32"],
				// The analog template works with yarn, but the build takes so long that it
				// becomes flaky in CI
				unsupportedPms: ["yarn", "bun"],
				verifyDeploy: {
					route: "/",
					expectedText: "The fullstack meta-framework for Angular!",
				},
				verifyPreview: {
					route: "/api/v1/test",
					expectedText: "C3_TEST",
				},
				verifyBuildCfTypes: {
					outputFile: "worker-configuration.d.ts",
					envInterfaceName: "Env",
				},
				verifyBuild: {
					outputDir: "./dist/analog/public",
					script: "build",
					route: "/api/v1/test",
					expectedText: "C3_TEST",
				},
				flags: ["--skipTailwind"],
			},
			angular: {
				testCommitMessage: true,
				timeout: LONG_TIMEOUT,
				unsupportedOSs: ["win32"],
				unsupportedPms: ["bun"],
				verifyDeploy: {
					route: "/",
					expectedText: "Congratulations! Your app is running.",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Congratulations! Your app is running.",
				},
				flags: ["--style", "sass"],
			},
			gatsby: {
				unsupportedPms: ["bun", "pnpm"],
				promptHandlers: [
					{
						matcher: /Would you like to use a template\?/,
						input: ["n"],
					},
				],
				testCommitMessage: true,
				timeout: LONG_TIMEOUT,
				verifyDeploy: {
					route: "/",
					expectedText: "Gatsby!",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Gatsby!",
				},
			},
			hono: {
				testCommitMessage: false,
				unsupportedOSs: ["win32"],
				verifyDeploy: {
					route: "/",
					expectedText: "Hello Hono!",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Hello Hono!",
				},
				promptHandlers: [
					{
						matcher: /Do you want to install project dependencies\?/,
						input: [keys.enter],
					},
				],
			},
			qwik: {
				promptHandlers: [
					{
						matcher: /Yes looks good, finish update/,
						input: [keys.enter],
					},
				],
				testCommitMessage: true,
				unsupportedOSs: ["win32"],
				unsupportedPms: ["yarn"],
				verifyDeploy: {
					route: "/",
					expectedText: "Welcome to Qwik",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Welcome to Qwik",
				},
				verifyBuildCfTypes: {
					outputFile: "worker-configuration.d.ts",
					envInterfaceName: "Env",
				},
			},
			remix: {
				testCommitMessage: true,
				timeout: LONG_TIMEOUT,
				unsupportedPms: ["yarn"],
				unsupportedOSs: ["win32"],
				verifyDeploy: {
					route: "/",
					expectedText: "Welcome to Remix",
				},
				verifyPreview: {
					route: "/test",
					expectedText: "C3_TEST",
				},
				verifyBuildCfTypes: {
					outputFile: "worker-configuration.d.ts",
					envInterfaceName: "Env",
				},
				verifyBuild: {
					outputDir: "./build/client",
					script: "build",
					route: "/test",
					expectedText: "C3_TEST",
				},
				flags: ["--typescript", "--no-install", "--no-git-init"],
			},
			next: {
				promptHandlers: [
					{
						matcher: /Do you want to use the next-on-pages eslint-plugin\?/,
						input: ["y"],
					},
				],
				testCommitMessage: true,
				quarantine: true,
				verifyBuildCfTypes: {
					outputFile: "env.d.ts",
					envInterfaceName: "CloudflareEnv",
				},
				verifyDeploy: {
					route: "/",
					expectedText: "Create Next App",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Create Next App",
				},
				flags: [
					"--typescript",
					"--no-install",
					"--eslint",
					"--tailwind",
					"--src-dir",
					"--app",
					"--import-alias",
					"@/*",
				],
			},
			nuxt: {
				testCommitMessage: true,
				timeout: LONG_TIMEOUT,
				unsupportedOSs: ["win32"],
				verifyDeploy: {
					route: "/",
					expectedText: "Welcome to Nuxt!",
				},
				verifyPreview: {
					route: "/test",
					expectedText: "C3_TEST",
				},
				verifyBuildCfTypes: {
					outputFile: "worker-configuration.d.ts",
					envInterfaceName: "Env",
				},
				verifyBuild: {
					outputDir: "./dist",
					script: "build",
					route: "/test",
					expectedText: "C3_TEST",
				},
			},
			react: {
				promptHandlers: [
					{
						matcher: /Select a variant:/,
						input: [keys.enter],
					},
				],
				testCommitMessage: true,
				unsupportedOSs: ["win32"],
				unsupportedPms: ["yarn"],
				timeout: LONG_TIMEOUT,
				verifyDeploy: {
					route: "/",
					expectedText: "Vite + React",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Vite + React",
				},
			},
			solid: {
				promptHandlers: [
					{
						matcher: /Which template would you like to use/,
						input: [keys.enter],
					},
					{
						matcher: /Use Typescript/,
						input: [keys.enter],
					},
				],
				testCommitMessage: true,
				timeout: LONG_TIMEOUT,
				unsupportedPms: ["npm", "yarn"],
				unsupportedOSs: ["win32"],
				verifyDeploy: {
					route: "/",
					expectedText: "Hello world",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Hello world",
				},
			},
			svelte: {
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
				unsupportedPms: ["npm"],
				verifyDeploy: {
					route: "/",
					expectedText: "SvelteKit app",
				},
				verifyPreview: {
					route: "/test",
					expectedText: "C3_TEST",
				},
				verifyBuild: {
					outputDir: ".svelte-kit/cloudflare",
					script: "build",
					route: "/test",
					expectedText: "C3_TEST",
				},
			},
			vue: {
				testCommitMessage: true,
				unsupportedOSs: ["win32"],
				verifyDeploy: {
					route: "/",
					expectedText: "Vite App",
				},
				verifyPreview: {
					route: "/",
					expectedText: "Vite App",
				},
				flags: ["--ts"],
				quarantine: true,
			},
		};
	}
}

const experimental = Boolean(process.env.E2E_EXPERIMENTAL);
const frameworkMap = getFrameworkMap({ experimental });
const frameworkTests = getFrameworkTests({ experimental });

describe.concurrent(
	`E2E: Web frameworks (experimental:${experimental})`,
	() => {
		beforeAll(async (ctx) => {
			recreateLogFolder({ experimental }, ctx);
			recreateDiffsFolder({ experimental });
		});

		Object.keys(frameworkTests).forEach((frameworkId) => {
			const frameworkConfig = frameworkMap[frameworkId];
			const testConfig = frameworkTests[frameworkId];

			test({ experimental }).runIf(shouldRunTest(frameworkId, testConfig))(
				frameworkId,
				async ({ logStream, project }) => {
					if (!testConfig.verifyDeploy) {
						expect(
							true,
							"A `deploy` configuration must be defined for all framework tests",
						).toBe(false);
						return;
					}

					try {
						const deploymentUrl = await runCli(
							frameworkId,
							project.path,
							logStream,
							{
								argv: [
									...(experimental ? ["--experimental"] : []),
									...(testConfig.flags ? ["--", ...testConfig.flags] : []),
								],
								promptHandlers: testConfig.promptHandlers,
							},
						);

						// Relevant project files should have been created
						expect(project.path).toExist();
						const pkgJsonPath = join(project.path, "package.json");
						expect(pkgJsonPath).toExist();

						// Wrangler should be installed
						const wranglerPath = join(project.path, "node_modules/wrangler");
						expect(wranglerPath).toExist();

						await addTestVarsToWranglerToml(project.path);

						// Make a request to the deployed project and verify it was successful
						await verifyDeployment(
							testConfig,
							frameworkId,
							project.name,
							`${deploymentUrl}${testConfig.verifyDeploy.route}`,
							testConfig.verifyDeploy.expectedText,
						);

						// Copy over any test fixture files
						const fixturePath = join(__dirname, "fixtures", frameworkId);
						if (existsSync(fixturePath)) {
							await cp(fixturePath, project.path, {
								recursive: true,
								force: true,
							});
						}

						await verifyPreviewScript(
							testConfig,
							frameworkConfig,
							project.path,
							logStream,
						);
						await verifyBuildCfTypesScript(testConfig, project.path, logStream);
						await verifyBuildScript(testConfig, project.path, logStream);
						await storeDiff(frameworkId, project.path, { experimental });
					} catch (e) {
						console.error("ERROR", e);
						expect.fail(
							"Failed due to an exception while running C3. See logs for more details",
						);
					} finally {
						// Cleanup the project in case we need to retry it
						if (frameworkConfig.platform === "workers") {
							await deleteWorker(project.name);
						} else {
							await deleteProject(project.name);
						}
					}
				},
				{
					retry: TEST_RETRIES,
					timeout: testConfig.timeout || TEST_TIMEOUT,
				},
			);
		});
	},
);

const storeDiff = async (
	framework: string,
	projectPath: string,
	opts: { experimental: boolean },
) => {
	if (!process.env.SAVE_DIFFS) {
		return;
	}

	const outputPath = join(getDiffsPath(opts), `${framework}.diff`);

	const output = await runCommand(["git", "diff"], {
		silent: true,
		cwd: projectPath,
	});

	writeFile(outputPath, output);
};

const runCli = async (
	framework: string,
	projectPath: string,
	logStream: Writable,
	{
		argv = [],
		promptHandlers = [],
	}: Pick<RunnerConfig, "argv" | "promptHandlers">,
) => {
	const args = [
		projectPath,
		"--type",
		"web-framework",
		"--framework",
		framework,
		NO_DEPLOY ? "--no-deploy" : "--deploy",
		"--no-open",
		process.env.SAVE_DIFFS ? "--git" : "--no-git",
	];

	args.push(...argv);

	const { output } = await runC3(args, promptHandlers, logStream);
	if (NO_DEPLOY) {
		return null;
	}

	const deployedUrlRe =
		/deployment is ready at: (https:\/\/.+?\.(pages|workers)\.dev)/;

	const match = output.replaceAll("\n", "").match(deployedUrlRe);
	if (!match || !match[1]) {
		console.error(output);
		expect(false, "Couldn't find deployment url in C3 output").toBe(true);
		return "";
	}

	return match[1];
};

/**
 * Either update or create a wrangler.toml to include a `TEST` var.
 *
 * This is rather than having a wrangler.toml in the e2e test's fixture folder,
 * which overwrites any that comes from the framework's template.
 */
const addTestVarsToWranglerToml = async (projectPath: string) => {
	const wranglerTomlPath = join(projectPath, "wrangler.toml");
	let wranglerToml: JsonMap = {};
	const wranglerTomlExists = existsSync(wranglerTomlPath);
	if (wranglerTomlExists) {
		wranglerToml = readToml(wranglerTomlPath);
	}

	// Add a TEST var to the wrangler.toml
	wranglerToml.vars ??= {};
	(wranglerToml.vars as JsonMap).TEST = "C3_TEST";

	writeToml(wranglerTomlPath, wranglerToml);
};

const verifyDeployment = async (
	{ testCommitMessage }: FrameworkTestConfig,
	frameworkId: string,
	projectName: string,
	deploymentUrl: string,
	expectedText: string,
) => {
	if (NO_DEPLOY) {
		return;
	}

	if (testCommitMessage) {
		await testDeploymentCommitMessage(projectName, frameworkId);
	}

	await retry({ times: 5 }, async () => {
		await sleep(1000);
		const res = await fetch(deploymentUrl);
		const body = await res.text();
		if (!body.includes(expectedText)) {
			throw new Error(
				`Deployed page (${deploymentUrl}) didn't contain expected string: "${expectedText}"`,
			);
		}
	});
};

const verifyPreviewScript = async (
	{ verifyPreview }: FrameworkTestConfig,
	{ previewScript }: TemplateConfig,
	projectPath: string,
	logStream: Writable,
) => {
	if (!verifyPreview || !previewScript) {
		return;
	}

	// Run the dev-server on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const proc = spawnWithLogging(
		[
			pm,
			"run",
			previewScript,
			...(pm === "npm" ? ["--"] : []),
			"--port",
			`${TEST_PORT}`,
		],
		{
			cwd: projectPath,
			env: {
				VITEST: undefined,
			},
		},
		logStream,
	);

	try {
		// Wait for the dev-server to be ready
		await retry(
			{ times: 20, sleepMs: 5000 },
			async () =>
				await fetch(`http://127.0.0.1:${TEST_PORT}${verifyPreview.route}`),
		);

		// Make a request to the specified test route
		const res = await fetch(
			`http://127.0.0.1:${TEST_PORT}${verifyPreview.route}`,
		);
		expect(await res.text()).toContain(verifyPreview.expectedText);
	} finally {
		// Kill the process gracefully so ports can be cleaned up
		await kill(proc);
		// Wait for a second to allow process to exit cleanly. Otherwise, the port might
		// end up camped and cause future runs to fail
		await sleep(1000);
	}
};

const verifyBuildCfTypesScript = async (
	{ verifyBuildCfTypes }: FrameworkTestConfig,
	projectPath: string,
	logStream: Writable,
) => {
	if (!verifyBuildCfTypes) {
		return;
	}

	const { outputFile, envInterfaceName } = verifyBuildCfTypes;

	const outputFileContentPre = readFile(join(projectPath, outputFile));
	const outputFileContentPreLines = outputFileContentPre.split("\n");

	// the file contains the "Generated by Wrangler" comment without a timestamp
	expect(outputFileContentPreLines).toContain("// Generated by Wrangler");

	// the file contains the env interface
	expect(outputFileContentPreLines).toContain(
		`interface ${envInterfaceName} {`,
	);

	// Run the `cf-typegen` script to generate types for bindings in fixture
	const buildTypesProc = spawnWithLogging(
		[pm, "run", "cf-typegen"],
		{ cwd: projectPath },
		logStream,
	);
	await waitForExit(buildTypesProc);

	const outputFileContentPost = readFile(join(projectPath, outputFile));
	const outputFileContentPostLines = outputFileContentPost.split("\n");

	// the file doesn't contain the "Generated by Wrangler" comment anymore
	expect(outputFileContentPostLines).not.toContain("// Generated by Wrangler");

	// the file still contains the env interface
	expect(outputFileContentPostLines).toContain(
		`interface ${envInterfaceName} {`,
	);
};

const verifyBuildScript = async (
	{ verifyBuild }: FrameworkTestConfig,
	projectPath: string,
	logStream: Writable,
) => {
	if (!verifyBuild) {
		return;
	}

	const { outputDir, script, route, expectedText } = verifyBuild;

	// Run the build scripts
	const buildProc = spawnWithLogging(
		[pm, "run", script],
		{
			cwd: projectPath,
			env: {
				NODE_ENV: "production",
			},
		},
		logStream,
	);
	await waitForExit(buildProc);

	// Run wrangler dev on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const devProc = spawnWithLogging(
		[npx, "wrangler", "pages", "dev", outputDir, "--port", `${TEST_PORT}`],
		{
			cwd: projectPath,
		},
		logStream,
	);

	// Wait a few seconds for dev server to spin up
	await sleep(7000);

	// Make a request to the specified test route
	const res = await fetch(`http://127.0.0.1:${TEST_PORT}${route}`);
	const body = await res.text();

	// Kill the process gracefully so ports can be cleaned up
	await kill(devProc);

	// Wait for a second to allow process to exit cleanly. Otherwise, the port might
	// end up camped and cause future runs to fail
	await sleep(1000);

	// Verify expectation after killing the process so that it exits cleanly in case of failure
	expect(body).toContain(expectedText);
};

function shouldRunTest(frameworkId: string, testConfig: FrameworkTestConfig) {
	const quarantineModeMatch =
		isQuarantineMode() == (testConfig.quarantine ?? false);

	// If the framework in question is being run in isolation, always run it.
	// Otherwise, only run the test if it's configured `quarantine` value matches
	// what is set in E2E_QUARANTINE
	const frameworkToTest = getFrameworkToTest({ experimental });
	let shouldRun = frameworkToTest
		? frameworkToTest === frameworkId
		: quarantineModeMatch;

	// Skip if the package manager is unsupported
	shouldRun &&= !testConfig.unsupportedPms?.includes(TEST_PM);

	// Skip if the OS is unsupported
	shouldRun &&= !testConfig.unsupportedOSs?.includes(process.platform);

	return shouldRun;
}
