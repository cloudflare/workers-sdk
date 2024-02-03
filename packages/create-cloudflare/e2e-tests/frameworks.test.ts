import { cp } from "fs/promises";
import { join } from "path";
import { retry } from "helpers/command";
import { sleep } from "helpers/common";
import { detectPackageManager } from "helpers/packages";
import { fetch } from "undici";
import { beforeAll, describe, expect, test } from "vitest";
import { deleteProject, deleteWorker } from "../scripts/common";
import { getFrameworkMap } from "../src/templates";
import { frameworkToTest } from "./frameworkToTest";
import {
	isQuarantineMode,
	keys,
	recreateLogFolder,
	runC3,
	spawnWithLogging,
	testDeploymentCommitMessage,
	testProjectDir,
} from "./helpers";
import type { FrameworkMap, FrameworkName } from "../src/templates";
import type { RunnerConfig } from "./helpers";
import type { Suite, TestContext } from "vitest";

const TEST_TIMEOUT = 1000 * 60 * 5;
const LONG_TIMEOUT = 1000 * 60 * 10;

type FrameworkTestConfig = Omit<RunnerConfig, "ctx"> & {
	expectResponseToContain: string;
	testCommitMessage: boolean;
	timeout?: number;
	unsupportedPms?: string[];
	unsupportedOSs?: string[];
	shouldTestDevScript?: boolean;
};

let frameworkMap: FrameworkMap;

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
		shouldTestDevScript: true,
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
	beforeAll(async (ctx) => {
		frameworkMap = await getFrameworkMap();
		recreateLogFolder(ctx as Suite);
	});

	Object.keys(frameworkTests).forEach((framework) => {
		const {
			quarantine,
			timeout,
			testCommitMessage,
			unsupportedPms,
			unsupportedOSs,
			shouldTestDevScript,
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
				const frameworkConfig = frameworkMap[framework as FrameworkName];
				try {
					await verifyDeployment(
						framework,
						projectName,
						projectPath,
						ctx,
						testCommitMessage
					);
					if (shouldTestDevScript) {
						await testDevScript(framework, projectPath, ctx);
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
			// { retry: 1, timeout: timeout || TEST_TIMEOUT }
			{ retry: 0, timeout: timeout || TEST_TIMEOUT }
		);
	});

	// test.skip("Hono (wrangler defaults)", async (ctx) => {
	// 	await runCli("hono", { ctx, argv: ["--wrangler-defaults"] });
	// });
});

// TODO: Refactor to a function that returns the deployment URL so expectation can be
// done in the actual test
const verifyDeployment = async (
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

const runCli = async (
	framework: string,
	projectPath: string,
	{ ctx, argv = [], promptHandlers = [] }: RunnerConfig
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

	// TODO: Before the refactor introduced in https://github.com/cloudflare/workers-sdk/pull/4754
	//       we used to test the packageJson scripts transformations here, try to re-implement such
	//       checks (might be harder given the switch to a transform function compared to the old
	//       object based substitution)

	return { output };
};

const testDevScript = async (
	framework: string,
	projectPath: string,
	ctx: TestContext
) => {
	const template = frameworkMap[framework as FrameworkName];

	// Copy over any test fixture files
	const fixturePath = join(__dirname, "fixtures", framework);
	await cp(fixturePath, projectPath, { recursive: true, force: true });

	// Run the devserver on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const { name: pm } = detectPackageManager();
	const proc = spawnWithLogging(
		pm,
		["run", template.devScript as string, "--port", `${TEST_PORT}`],
		{
			cwd: projectPath,
			env: {
				NODE_ENV: "development",
			},
		},
		ctx
	);

	// Wait a few seconds for dev server to spin up
	await sleep(14000);

	// By convention and for simplicity of testing, each test fixture will
	// make a page or a simple api route on `/test` that will print a bound
	// environment variable set to the value "C3_TEST"
	const res = await fetch(`http://localhost:${TEST_PORT}/test`);
	const body = await res.text();
	expect(body).toContain("C3_TEST");

	// Kill the process gracefully so ports can be cleaned up
	proc.kill("SIGINT");

	// Wait for a second to allow process to exit cleanly. Otherwise, the port might
	// end up camped and cause future runs to fail
	await sleep(1000);
};
