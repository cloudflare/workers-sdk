import assert from "assert";
import { existsSync } from "fs";
import { cp } from "fs/promises";
import { join } from "path";
import {
	readFile,
	readJSON,
	readToml,
	writeJSON,
	writeToml,
} from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import * as jsonc from "jsonc-parser";
import { fetch } from "undici";
import { beforeAll, describe, expect } from "vitest";
import { deleteProject, deleteWorker } from "../scripts/common";
import { getFrameworkMap } from "../src/templates";
import getFrameworkTestConfig from "./frameworks/framework-test-config";
import getFrameworkTestConfigExperimental from "./frameworks/framework-test-config-experimental";
import { getFrameworkToTest } from "./frameworks/framework-to-test";
import {
	isQuarantineMode,
	kill,
	NO_DEPLOY,
	recreateLogFolder,
	runC3,
	spawnWithLogging,
	test,
	TEST_PM,
	TEST_RETRIES,
	TEST_TIMEOUT,
	testDeploymentCommitMessage,
	testGitCommitMessage,
} from "./helpers";
import type { TemplateConfig } from "../src/templates";
import type { RunnerConfig } from "./helpers";
import type { JsonMap } from "@iarna/toml";
import type { Writable } from "stream";

type FrameworkTestConfig = RunnerConfig & {
	testCommitMessage: boolean;
	nodeCompat: boolean;
	unsupportedPms?: string[];
	unsupportedOSs?: string[];
	flags?: string[];
};

const { name: pm } = detectPackageManager();

function getFrameworkTests(opts: {
	experimental: boolean;
}): Record<string, FrameworkTestConfig> {
	if (opts.experimental) {
		return getFrameworkTestConfigExperimental();
	} else {
		return getFrameworkTestConfig(pm);
	}
}

const experimental = process.env.E2E_EXPERIMENTAL === "true";
const frameworkMap = getFrameworkMap({ experimental });
const frameworkTests = getFrameworkTests({ experimental });

describe.concurrent(
	`E2E: Web frameworks (experimental:${experimental})`,
	() => {
		beforeAll(async (ctx) => {
			recreateLogFolder({ experimental }, ctx);
		});

		Object.entries(frameworkTests).forEach(([frameworkKey, testConfig]) => {
			const frameworkConfig = {
				workersTypes: "generated" as const,
				typesPath: "./worker-configuration.d.ts",
				envInterfaceName: "Env",
				...getFrameworkConfig(frameworkKey),
			};
			test({ experimental }).runIf(
				shouldRunTest(frameworkConfig.id, testConfig),
			)(
				`${frameworkConfig.id} (${frameworkConfig.platform ?? "pages"})`,
				{
					retry: TEST_RETRIES,
					timeout: testConfig.timeout || TEST_TIMEOUT,
				},
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
							frameworkConfig.id,
							project.path,
							logStream,
							{
								argv: [
									...(testConfig.argv ?? []),
									...(experimental ? ["--experimental"] : []),
									...(testConfig.testCommitMessage ? ["--git"] : ["--no-git"]),
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

						if (testConfig.testCommitMessage) {
							await testGitCommitMessage(
								project.name,
								frameworkConfig.id,
								project.path,
							);
						}

						// Make a request to the deployed project and verify it was successful
						await verifyDeployment(
							testConfig,
							frameworkConfig.id,
							project.name,
							`${deploymentUrl}${testConfig.verifyDeploy.route}`,
							testConfig.verifyDeploy.expectedText,
						);

						// Copy over any platform specific test fixture files
						const platformFixturePath = join(
							__dirname,
							"fixtures",
							frameworkConfig.id,
							frameworkConfig.platform,
						);
						if (existsSync(platformFixturePath)) {
							await cp(platformFixturePath, project.path, {
								recursive: true,
								force: true,
							});
						} else {
							// Copy over any platform agnostic test fixture files
							const fixturePath = join(
								__dirname,
								"fixtures",
								frameworkConfig.id,
							);
							if (existsSync(fixturePath)) {
								await cp(fixturePath, project.path, {
									recursive: true,
									force: true,
								});
							}
						}

						await verifyPreviewScript(
							testConfig,
							frameworkConfig,
							project.path,
							logStream,
						);

						await verifyTypes(testConfig, frameworkConfig, project.path);
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
			);
		});
	},
);

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
		"--no-auto-update",
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
 * Either update or create a wrangler configuration file to include a `TEST` var.
 *
 * This is rather than having a wrangler configuration file in the e2e test's fixture folder,
 * which overwrites any that comes from the framework's template.
 */
const addTestVarsToWranglerToml = async (projectPath: string) => {
	const wranglerTomlPath = join(projectPath, "wrangler.toml");
	const wranglerJsoncPath = join(projectPath, "wrangler.jsonc");

	if (existsSync(wranglerTomlPath)) {
		const wranglerToml = readToml(wranglerTomlPath);
		wranglerToml.vars ??= {};
		(wranglerToml.vars as JsonMap).TEST = "C3_TEST";

		writeToml(wranglerTomlPath, wranglerToml);
	} else if (existsSync(wranglerJsoncPath)) {
		const wranglerJsonc = readJSON(wranglerJsoncPath) as {
			vars: Record<string, string>;
		};
		wranglerJsonc.vars ??= {};
		wranglerJsonc.vars.TEST = "C3_TEST";

		writeJSON(wranglerJsoncPath, wranglerJsonc);
	}
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

	if (testCommitMessage && process.env.CLOUDFLARE_API_TOKEN) {
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
	if (!verifyPreview) {
		return;
	}

	assert(
		previewScript,
		"Expected a preview script is we are verifying the preview in " +
			projectPath,
	);

	// Run the dev-server on a random port to avoid colliding with other tests
	const TEST_PORT = Math.ceil(Math.random() * 1000) + 20000;

	const proc = spawnWithLogging(
		[
			pm,
			"run",
			previewScript,
			...(pm === "npm" ? ["--"] : []),
			...(verifyPreview.previewArgs ?? []),
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
		// Some frameworks take quite a long time to build the application (e.g. Docusaurus)
		// so wait up to 5 mins for the dev-server to be ready.
		await retry(
			{ times: 300, sleepMs: 5000 },
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

const verifyTypes = async (
	{ nodeCompat }: FrameworkTestConfig,
	{
		workersTypes,
		typesPath = "./worker-configuration.d.ts",
		envInterfaceName = "Env",
	}: TemplateConfig,
	projectPath: string,
) => {
	if (workersTypes === "none") {
		return;
	}

	const outputFileContent = readFile(join(projectPath, typesPath)).split("\n");

	const hasEnvInterface = outputFileContent.some(
		(line) =>
			// old type gen - some framework templates pin older versions of wrangler
			line === `interface ${envInterfaceName} {` ||
			// new after importable env change
			line === `interface ${envInterfaceName} extends Cloudflare.Env {}`,
	);
	expect(hasEnvInterface).toBe(true);

	// if the runtime types were installed, they wont be in this file
	if (workersTypes === "generated") {
		expect(outputFileContent[2]).match(
			/\/\/ Runtime types generated with workerd@1\.\d{8}\.\d \d{4}-\d{2}-\d{2} ([a-z_]+,?)*/,
		);
	}

	const tsconfigPath = join(projectPath, "tsconfig.json");
	const tsconfigTypes = jsonc.parse(readFile(tsconfigPath)).compilerOptions
		?.types;
	if (workersTypes === "generated") {
		expect(tsconfigTypes).toContain(typesPath);
	}
	if (workersTypes === "installed") {
		expect(
			tsconfigTypes.some((x: string) =>
				x.includes("@cloudflare/workers-types"),
			),
		).toBe(true);
	}
	if (nodeCompat) {
		expect(tsconfigTypes).toContain(`node`);
	}
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

/**
 * Get the framework config and test info given a `frameworkKey`.
 *
 * Some frameworks support both Pages and Workers platform variants.
 * If so, then the test must specify the variant in its key, of the form
 * `<frameworkId>:<"pages"|"workers">`.
 */
function getFrameworkConfig(frameworkKey: string) {
	const [frameworkId, platformVariant] = frameworkKey.split(":");
	if ("platformVariants" in frameworkMap[frameworkId]) {
		assert(
			platformVariant === "pages" || platformVariant === "workers",
			`Missing or invalid platformVariant in "${frameworkKey}" test.\nPlease update the test maps to contain both "${frameworkId}:pages" and "${frameworkId}:workers" properties.`,
		);
		assert(
			"platformVariants" in frameworkMap[frameworkId],
			`Expected platformVariants for "${frameworkId}" framework config.`,
		);
		return frameworkMap[frameworkId].platformVariants[platformVariant];
	} else {
		assert(
			platformVariant === undefined,
			`Unexpected platform variant in test for ${frameworkId}`,
		);
		return frameworkMap[frameworkId];
	}
}
