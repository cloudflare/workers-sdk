import { existsSync } from "fs";
import { cp } from "fs/promises";
import { join } from "path";
import { readFile } from "helpers/files";
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
import { frameworkToTest } from "./frameworkToTest";
import {
	createTestLogStream,
	isQuarantineMode,
	keys,
	recreateLogFolder,
	runC3,
	spawnWithLogging,
	testDeploymentCommitMessage,
	testProjectDir,
	waitForExit,
} from "./helpers";
import type { FrameworkMap, FrameworkName } from "../src/templates";
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

// These are ordered based on speed and reliability for ease of debugging
const frameworkTests: Record<string, FrameworkTestConfig> = {
	astro: {
		testCommitMessage: true,
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
	},
	analog: {
		testCommitMessage: true,
		timeout: TEST_TIMEOUT,
		verifyDeploy: {
			route: "/",
			expectedText: "The fullstack meta-framework for Angular!",
		},
		flags: ["--skipTailwind"],
	},
	angular: {
		testCommitMessage: true,
		timeout: LONG_TIMEOUT,
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
		testCommitMessage: true,
		unsupportedOSs: ["win32"],
		timeout: LONG_TIMEOUT,
		verifyDeploy: {
			route: "/",
			expectedText: "React App",
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
	},
};

describe.concurrent(`E2E: Web frameworks`, () => {
	let frameworkMap: FrameworkMap;
	let logStream: WriteStream;

	beforeAll(async (ctx) => {
		frameworkMap = await getFrameworkMap();
		recreateLogFolder(ctx as Suite);
	});

	beforeEach(async (ctx) => {
		logStream = createTestLogStream(ctx);
	});

	afterEach(async () => {
		logStream.close();
	});

	Object.keys(frameworkTests).forEach((framework) => {
		const { quarantine, timeout, unsupportedPms, unsupportedOSs } =
			frameworkTests[framework];

		const quarantineModeMatch = isQuarantineMode() == (quarantine ?? false);

		// If the framework in question is being run in isolation, always run it.
		// Otherwise, only run the test if it's configured `quarantine` value matches
		// what is set in E2E_QUARANTINE
		let shouldRun = frameworkToTest
			? frameworkToTest === framework
			: quarantineModeMatch;

		// Skip if the package manager is unsupported
		shouldRun &&= !unsupportedPms?.includes(TEST_PM);

		// Skip if the OS is unsupported
		shouldRun &&= !unsupportedOSs?.includes(process.platform);
		test.runIf(shouldRun)(
			framework,
			async () => {
				const { getPath, getName, clean } = testProjectDir("pages");
				const projectPath = getPath(framework);
				const projectName = getName(framework);
				const frameworkConfig = frameworkMap[framework as FrameworkName];

				const { promptHandlers, verifyDeploy, flags } =
					frameworkTests[framework];

				if (!verifyDeploy) {
					expect(
						true,
						"A `deploy` configuration must be defined for all framework tests"
					).toBe(false);
					return;
				}

				try {
					const deploymentUrl = await runCli(
						framework,
						projectPath,
						logStream,
						{
							argv: [...(flags ? ["--", ...flags] : [])],
							promptHandlers,
						}
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
						framework,
						projectName,
						`${deploymentUrl}${verifyDeploy.route}`,
						verifyDeploy.expectedText
					);

					// Copy over any test fixture files
					const fixturePath = join(__dirname, "fixtures", framework);
					if (existsSync(fixturePath)) {
						await cp(fixturePath, projectPath, {
							recursive: true,
							force: true,
						});
					}

					await verifyDevScript(framework, projectPath, logStream);
					await verifyBuildCfTypesScript(framework, projectPath, logStream);
					await verifyBuildScript(framework, projectPath, logStream);
				} finally {
					clean(framework);
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
				timeout: timeout || TEST_TIMEOUT,
			}
		);
	});
});

const runCli = async (
	framework: string,
	projectPath: string,
	logStream: WriteStream,
	{ argv = [], promptHandlers = [] }: RunnerConfig
) => {
	const args = [
		projectPath,
		"--type",
		"web-framework",
		"--framework",
		framework,
		NO_DEPLOY ? "--no-deploy" : "--deploy",
		"--no-open",
		"--no-git",
	];

	args.push(...argv);

	const { output } = await runC3(args, promptHandlers, logStream);
	if (NO_DEPLOY) {
		return null;
	}

	const deployedUrlRe =
		/deployment is ready at: (https:\/\/.+\.(pages|workers)\.dev)/;

	const match = output.replaceAll("\n", "n").match(deployedUrlRe);
	if (!match || !match[1]) {
		expect(false, "Couldn't find deployment url in C3 output").toBe(true);
		return "";
	}

	return match[1];
};

const verifyDeployment = async (
	framework: string,
	projectName: string,
	deploymentUrl: string,
	expectedText: string
) => {
	if (NO_DEPLOY) {
		return;
	}

	const { testCommitMessage } = frameworkTests[framework];

	if (testCommitMessage) {
		await testDeploymentCommitMessage(projectName, framework);
	}

	await retry({ times: 5 }, async () => {
		await sleep(1000);
		const res = await fetch(deploymentUrl);
		const body = await res.text();
		if (!body.includes(expectedText)) {
			throw new Error(
				`Deployed page (${deploymentUrl}) didn't contain expected string: "${expectedText}"`
			);
		}
	});
};

const verifyDevScript = async (
	framework: string,
	projectPath: string,
	logStream: WriteStream
) => {
	const { verifyDev } = frameworkTests[framework];
	if (!verifyDev) {
		return;
	}

	const frameworkMap = await getFrameworkMap();
	const template = frameworkMap[framework as FrameworkName];

	// Run the devserver on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const proc = spawnWithLogging(
		[
			pm,
			"run",
			template.devScript as string,
			...(pm === "npm" ? ["--"] : []),
			"--port",
			`${TEST_PORT}`,
		],
		{
			cwd: projectPath,
			env: {
				NODE_ENV: "development",
			},
		},
		logStream
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
	framework: string,
	projectPath: string,
	logStream: WriteStream
) => {
	const { verifyBuildCfTypes } = frameworkTests[framework];

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
		`interface ${envInterfaceName} {`
	);

	// Run the `build-cf-types` script to generate types for bindings in fixture
	const buildTypesProc = spawnWithLogging(
		[pm, "run", "build-cf-types"],
		{ cwd: projectPath },
		logStream
	);
	await waitForExit(buildTypesProc);

	const outputFileContentPost = readFile(join(projectPath, outputFile));
	const outputFileContentPostLines = outputFileContentPost.split("\n");

	// the file still contains the env interface
	expect(outputFileContentPostLines).toContain(
		`interface ${envInterfaceName} {`
	);

	// the file doesn't contain the "Generated by Wrangler" comment without a timestamp anymore
	expect(outputFileContentPostLines).not.toContain("// Generated by Wrangler");

	// but it contains the "Generated by Wrangler" comment now with a timestamp
	expect(
		/\/\/ Generated by Wrangler on [a-zA-Z]*? [a-zA-Z]*? \d{2} \d{4} \d{2}:\d{2}:\d{2}/.test(
			outputFileContentPost
		)
	).toBeTruthy();
};

const verifyBuildScript = async (
	framework: string,
	projectPath: string,
	logStream: WriteStream
) => {
	const { verifyBuild } = frameworkTests[framework];

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
		logStream
	);
	await waitForExit(buildProc);

	// Run wrangler dev on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const devProc = spawnWithLogging(
		[npx, "wrangler", "pages", "dev", outputDir, "--port", `${TEST_PORT}`],
		{
			cwd: projectPath,
		},
		logStream
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
