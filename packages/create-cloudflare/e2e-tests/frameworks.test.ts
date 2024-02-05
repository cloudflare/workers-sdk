import { cp } from "fs/promises";
import { join } from "path";
import { retry } from "helpers/command";
import { sleep } from "helpers/common";
import { detectPackageManager } from "helpers/packages";
import { fetch } from "undici";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
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

type FrameworkTestConfig = Omit<RunnerConfig, "ctx"> & {
	expectResponseToContain: string;
	testCommitMessage: boolean;
	timeout?: number;
	unsupportedPms?: string[];
	unsupportedOSs?: string[];
	testBindings?: boolean;
	build?: {
		outputDir: string;
		script: string;
	};
};

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
		unsupportedOSs: ["win32"],
		timeout: LONG_TIMEOUT,
	},
	angular: {
		expectResponseToContain: "Congratulations! Your app is running.",
		testCommitMessage: true,
		timeout: LONG_TIMEOUT,
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
		unsupportedPms: ["yarn"],
		testBindings: true,
		build: {
			outputDir: "./dist",
			script: "build",
		},
	},
	remix: {
		expectResponseToContain: "Welcome to Remix",
		testCommitMessage: true,
		timeout: LONG_TIMEOUT,
		unsupportedPms: ["yarn"],
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
		unsupportedOSs: ["win32"],
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
		unsupportedOSs: ["win32"],
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
		unsupportedPms: ["npm"],
	},
	vue: {
		expectResponseToContain: "Vite App",
		testCommitMessage: true,
		unsupportedOSs: ["win32"],
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

	Object.keys(frameworkTests).forEach((framework) => {
		const {
			quarantine,
			timeout,
			testCommitMessage,
			unsupportedPms,
			unsupportedOSs,
			testBindings,
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
			async () => {
				const { getPath, getName, clean } = testProjectDir("pages");
				const projectPath = getPath(framework);
				const projectName = getName(framework);
				const frameworkConfig = frameworkMap[framework as FrameworkName];

				const { argv, overrides, promptHandlers, expectResponseToContain } =
					frameworkTests[framework];

				try {
					const deploymentUrl = await runCli(
						framework,
						projectPath,
						logStream,
						{
							argv: [...(argv ?? [])],
							overrides,
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

					if (testCommitMessage) {
						await testDeploymentCommitMessage(projectName, framework);
					}

					// Make a request to the deployed project and verify it was successful
					await verifyDeployment(deploymentUrl, expectResponseToContain);

					// If configured, run the dev script and verify bindings work
					if (testBindings) {
						// Copy over any test fixture files
						const fixturePath = join(__dirname, "fixtures", framework);
						await cp(fixturePath, projectPath, {
							recursive: true,
							force: true,
						});

						await verifyDevScript(framework, projectPath, logStream);
						await verifyBuildScript(framework, projectPath, logStream);
					}
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
			{ retry: 1, timeout: timeout || TEST_TIMEOUT }
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
		"webFramework",
		"--framework",
		framework,
		"--deploy",
		"--no-open",
		"--no-git",
	];

	args.push(...argv);

	const { output } = await runC3(args, promptHandlers, logStream);

	const deployedUrlRe =
		/deployment is ready at: (https:\/\/.+\.(pages|workers)\.dev)/;

	const match = output.match(deployedUrlRe);
	if (!match || !match[1]) {
		expect(false, "Couldn't find deployment url in C3 output").toBe(true);
		return "";
	}

	return match[1];
};

const verifyDeployment = async (
	deploymentUrl: string,
	expectedToken: string
) => {
	await retry({ times: 5 }, async () => {
		await new Promise((resolve) => setTimeout(resolve, 1000)); // wait a second
		const res = await fetch(deploymentUrl);
		const body = await res.text();
		if (!body.includes(expectedToken)) {
			throw new Error(
				`Deployed page (${deploymentUrl}) didn't contain expected string: "${expectedToken}"`
			);
		}
	});
};

const verifyDevScript = async (
	framework: string,
	projectPath: string,
	logStream: WriteStream
) => {
	const frameworkMap = await getFrameworkMap();
	const template = frameworkMap[framework as FrameworkName];

	// Run the devserver on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const { name: pm } = detectPackageManager();
	const proc = spawnWithLogging(
		[pm, "run", template.devScript as string, "--port", `${TEST_PORT}`],
		{
			cwd: projectPath,
			env: {
				NODE_ENV: "development",
			},
		},
		logStream
	);

	// Wait a few seconds for dev server to spin up
	await sleep(4000);

	// By convention and for simplicity of testing, each test fixture will
	// make a page or a simple api route on `/test` that will print a bound
	// environment variable set to the value "C3_TEST"
	const res = await fetch(`http://localhost:${TEST_PORT}/test`);
	const body = await res.text();

	// Kill the process gracefully so ports can be cleaned up
	proc.kill("SIGINT");

	// Wait for a second to allow process to exit cleanly. Otherwise, the port might
	// end up camped and cause future runs to fail
	await sleep(1000);

	expect(body).toContain("C3_TEST");
};

const verifyBuildScript = async (
	framework: string,
	projectPath: string,
	logStream: WriteStream
) => {
	const { build } = frameworkTests[framework];

	if (!build) {
		throw Error(
			"`build` must be specified in test config when verifying bindings"
		);
	}

	const { outputDir, script } = build;

	// Run the build script
	const { name: pm, npx } = detectPackageManager();
	const buildProc = spawnWithLogging(
		[pm, "run", script],
		{
			cwd: projectPath,
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
	await sleep(4000);

	// By convention and for simplicity of testing, each test fixture will
	// make a page or a simple api route on `/test` that will print a bound
	// environment variable set to the value "C3_TEST"
	const res = await fetch(`http://localhost:${TEST_PORT}/test`);
	const body = await res.text();

	// Kill the process gracefully so ports can be cleaned up
	devProc.kill("SIGINT");

	// Wait for a second to allow process to exit cleanly. Otherwise, the port might
	// end up camped and cause future runs to fail
	await sleep(1000);

	// Verify expectation after killing the process so that it exits cleanly in case of failure
	expect(body).toContain("C3_TEST");
};
