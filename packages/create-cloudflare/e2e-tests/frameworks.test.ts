import assert from "assert";
import { existsSync } from "fs";
import { cp } from "fs/promises";
import { join } from "path";
import { runCommand } from "helpers/command";
import { readFile, writeFile } from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "vitest";
import { deleteProject, deleteWorker } from "../scripts/common";
import { getFrameworkMap } from "../src/templates";
import { getFrameworkToTest } from "./frameworkToTest";
import {
	createTestLogStream,
	getDiffsPath,
	isQuarantineMode,
	keys,
	recreateDiffsFolder,
	recreateLogFolder,
	runC3,
	spawnWithLogging,
	testDeploymentCommitMessage,
	testProjectDir,
	waitForExit,
} from "./helpers";
import type { TemplateConfig } from "../src/templates";
import type { RunnerConfig } from "./helpers";
import type { WriteStream } from "fs";
import type { Suite } from "vitest";

const TEST_TIMEOUT = 1000 * 60 * 5;
const LONG_TIMEOUT = 1000 * 60 * 10;
const TEST_PM = process.env.TEST_PM ?? "";
const NO_DEPLOY = process.env.E2E_NO_DEPLOY ?? false;
const TEST_RETRIES = process.env.E2E_RETRIES
	? parseInt(process.env.E2E_RETRIES)
	: 1;

type FrameworkTestConfig = RunnerConfig & {
	testCommitMessage: boolean;
	unsupportedPms?: string[];
	unsupportedOSs?: string[];
	verifyDev?: {
		route: string;
		expectedText: string;
	};
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
				verifyDev: {
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
				unsupportedPms: ["yarn"],
				verifyDeploy: {
					route: "/",
					expectedText: "The fullstack meta-framework for Angular!",
				},
				verifyDev: {
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
				quarantine: true,
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
			},
			hono: {
				testCommitMessage: false,
				unsupportedOSs: ["win32"],
				verifyDeploy: {
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
				verifyDev: {
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
			remix: {
				testCommitMessage: true,
				timeout: LONG_TIMEOUT,
				unsupportedPms: ["yarn"],
				unsupportedOSs: ["win32"],
				verifyDeploy: {
					route: "/",
					expectedText: "Welcome to Remix",
				},
				verifyDev: {
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
				verifyDev: {
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
				verifyDev: {
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
		let logStream: WriteStream;

		beforeAll(async (ctx) => {
			recreateLogFolder({ experimental }, ctx as Suite);
			recreateDiffsFolder({ experimental });
		});

		beforeEach(async (ctx) => {
			logStream = createTestLogStream({ experimental }, ctx);
		});

		afterEach(async () => {
			logStream.close();
		});

		test("dummy in case there are no frameworks to test", () => {});

		Object.keys(frameworkTests).forEach((frameworkId) => {
			const frameworkConfig = frameworkMap[frameworkId];
			const testConfig = frameworkTests[frameworkId];

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
			test.runIf(shouldRun)(
				frameworkId,
				async () => {
					const { getPath, getName, clean } = testProjectDir("pages");
					const projectPath = getPath(frameworkId);
					const projectName = getName(frameworkId);

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
							projectPath,
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
						expect(projectPath).toExist();
						const pkgJsonPath = join(projectPath, "package.json");
						expect(pkgJsonPath).toExist();

						// Wrangler should be installed
						const wranglerPath = join(projectPath, "node_modules/wrangler");
						expect(wranglerPath).toExist();

						// Make a request to the deployed project and verify it was successful
						await verifyDeployment(
							testConfig,
							frameworkId,
							projectName,
							`${deploymentUrl}${testConfig.verifyDeploy.route}`,
							testConfig.verifyDeploy.expectedText,
						);

						// Copy over any test fixture files
						const fixturePath = join(__dirname, "fixtures", frameworkId);
						if (existsSync(fixturePath)) {
							await cp(fixturePath, projectPath, {
								recursive: true,
								force: true,
							});
						}

						await verifyDevScript(
							testConfig,
							frameworkConfig,
							projectPath,
							logStream,
						);
						await verifyBuildCfTypesScript(testConfig, projectPath, logStream);
						await verifyBuildScript(testConfig, projectPath, logStream);
						await storeDiff(frameworkId, projectPath, { experimental });
					} catch (e) {
						console.error("ERROR", e);
						expect.fail(
							"Failed due to an exception while running C3. See logs for more details",
						);
					} finally {
						clean(frameworkId);
						// Cleanup the project in case we need to retry it
						if (frameworkConfig.platform === "workers") {
							await deleteWorker(projectName);
						} else {
							await deleteProject(projectName);
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
	logStream: WriteStream,
	{ argv = [], promptHandlers = [] }: RunnerConfig,
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

const verifyDevScript = async (
	{ verifyDev }: FrameworkTestConfig,
	{ devScript }: TemplateConfig,
	projectPath: string,
	logStream: WriteStream,
) => {
	if (!verifyDev) {
		return;
	}

	assert(devScript !== undefined, "Expected `devScript` to be defined");

	// Run the devserver on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const proc = spawnWithLogging(
		[
			pm,
			"run",
			devScript,
			...(pm === "npm" ? ["--"] : []),
			"--port",
			`${TEST_PORT}`,
		],
		{
			cwd: projectPath,
			env: {
				NODE_ENV: "development",
				VITEST: undefined,
			},
		},
		logStream,
	);

	// Retry requesting the test route from the devserver
	await retry({ times: 10 }, async () => {
		await sleep(2000);
		const res = await fetch(`http://localhost:${TEST_PORT}${verifyDev.route}`);
		const body = await res.text();
		if (!body.match(verifyDev?.expectedText)) {
			throw new Error("Expected text not found in response from devserver.");
		}
	});

	// Make a request to the specified test route
	const res = await fetch(`http://localhost:${TEST_PORT}${verifyDev.route}`);
	const body = await res.text();

	// Kill the process gracefully so ports can be cleaned up
	proc.kill("SIGINT");

	// Wait for a second to allow process to exit cleanly. Otherwise, the port might
	// end up camped and cause future runs to fail
	await sleep(1000);

	expect(body).toContain(verifyDev.expectedText);
};

const verifyBuildCfTypesScript = async (
	{ verifyBuildCfTypes }: FrameworkTestConfig,
	projectPath: string,
	logStream: WriteStream,
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
	logStream: WriteStream,
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
	const res = await fetch(`http://localhost:${TEST_PORT}${route}`);
	const body = await res.text();

	// Kill the process gracefully so ports can be cleaned up
	devProc.kill("SIGINT");

	// Wait for a second to allow process to exit cleanly. Otherwise, the port might
	// end up camped and cause future runs to fail
	await sleep(1000);

	// Verify expectation after killing the process so that it exits cleanly in case of failure
	expect(body).toContain(expectedText);
};
