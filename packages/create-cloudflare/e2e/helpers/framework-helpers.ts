import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import { runCommand } from "helpers/command";
import {
	readFile,
	readJSON,
	readToml,
	writeJSON,
	writeToml,
} from "helpers/files";
import { detectPackageManager } from "helpers/packageManagers";
import { retry } from "helpers/retry";
import * as jsonc from "jsonc-parser";
import { fetch } from "undici";
import { expect } from "vitest";
import { version } from "../../package.json";
import { getFrameworkMap } from "../../src/templates";
import {
	CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_API_TOKEN,
	isExperimental,
	runDeployTests,
	testPackageManager,
} from "./constants";
import { runC3 } from "./run-c3";
import { kill, spawnWithLogging } from "./spawn";
import type { TemplateConfig } from "../../src/templates";
import type { RunnerConfig } from "./run-c3";
import type { Writable } from "node:stream";

export type FrameworkTestConfig = RunnerConfig & {
	testCommitMessage: boolean;
	nodeCompat: boolean;
	unsupportedPms?: string[];
	unsupportedOSs?: string[];
	flags?: string[];
	extraEnv?: Record<string, string | undefined>;
};

const packageManager = detectPackageManager();

export async function runC3ForFrameworkTest(
	framework: string,
	projectPath: string,
	logStream: Writable,
	{
		argv = [],
		promptHandlers = [],
		extraEnv,
	}: Pick<FrameworkTestConfig, "argv" | "promptHandlers" | "extraEnv">,
) {
	const args = [
		projectPath,
		"--type",
		"web-framework",
		"--framework",
		framework,
		"--deploy",
		`${runDeployTests}`,
		"--no-open",
		"--no-auto-update",
		...argv,
	];

	const { output } = await runC3(args, promptHandlers, logStream, extraEnv);
	if (!runDeployTests) {
		return null;
	}

	const deployedUrlRe =
		/deployment is ready at: (https:\/\/.+?\.(pages|workers)\.dev)/;

	const match = output.replaceAll("\n", "").match(deployedUrlRe);
	if (!match || !match[1]) {
		// eslint-disable-next-line no-console
		console.error(output);
		expect(false, "Couldn't find deployment url in C3 output").toBe(true);
		return "";
	}

	return match[1];
}

export function updateWranglerConfig(
	projectPath: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	handleUpdate: <T extends Record<string, any>>(config: T) => T,
) {
	const wranglerTomlPath = join(projectPath, "wrangler.toml");
	const wranglerJsoncPath = join(projectPath, "wrangler.jsonc");

	if (existsSync(wranglerTomlPath)) {
		const wranglerToml = readToml(wranglerTomlPath);

		writeToml(
			wranglerTomlPath,
			handleUpdate(JSON.parse(JSON.stringify(wranglerToml))),
		);

		return () => {
			writeToml(wranglerTomlPath, handleUpdate(wranglerToml));
		};
	} else if (existsSync(wranglerJsoncPath)) {
		const wranglerJsonc = readJSON(wranglerJsoncPath) as {
			vars: Record<string, string>;
		};

		writeJSON(
			wranglerJsoncPath,
			handleUpdate(JSON.parse(JSON.stringify(wranglerJsonc))),
		);

		return () => {
			writeJSON(wranglerJsoncPath, wranglerJsonc);
		};
	}
}

/**
 * Either update or create a wrangler configuration file to include a `TEST` var.
 *
 * This is rather than having a wrangler configuration file in the e2e test's fixture folder,
 * which overwrites any that comes from the framework's template.
 */
export async function addTestVarsToWranglerToml(projectPath: string) {
	updateWranglerConfig(projectPath, (config) => {
		return {
			...config,
			vars: {
				...config.vars,
				TEST: "C3_TEST",
			},
		};
	});
}

export async function verifyDeployment(
	{ testCommitMessage }: FrameworkTestConfig,
	frameworkId: string,
	projectName: string,
	deploymentUrl: string,
	expectedText: string,
) {
	if (!runDeployTests) {
		return;
	}

	if (testCommitMessage && process.env.CLOUDFLARE_API_TOKEN) {
		await testDeploymentCommitMessage(projectName, frameworkId);
	}

	await retry({ times: 5 }, async () => {
		await setTimeout(1_000);
		const res = await fetch(deploymentUrl);
		const body = await res.text();
		if (!body.includes(expectedText)) {
			throw new Error(
				`Deployed page (${deploymentUrl}) didn't contain expected string: "${expectedText}"`,
			);
		}
	});
}

export async function verifyDevScript(
	{ verifyDev }: FrameworkTestConfig,
	{ devScript }: TemplateConfig,
	projectPath: string,
	logStream: Writable,
) {
	if (!verifyDev) {
		return;
	}

	assert(
		devScript,
		"Expected a dev script as we are verifying the dev session in " +
			projectPath,
	);

	// Run the dev-server on random ports to avoid colliding with other tests
	const port = await getPort();
	const proc = spawnWithLogging(
		[
			packageManager.name,
			"run",
			devScript,
			...(packageManager.name === "npm" ? ["--"] : []),
			...(verifyDev.devArgs ?? []),
			"--port",
			`${port}`,
		],
		{
			cwd: projectPath,
			env: {
				VITEST: undefined,
			},
		},
		logStream,
	);

	let restoreConfig: (() => void) | undefined;

	try {
		await retry(
			{ times: 300, sleepMs: 5_000 },
			async () => await fetch(`http://127.0.0.1:${port}${verifyDev.route}`),
		);

		// Make a request to the specified test route
		const res = await fetch(`http://127.0.0.1:${port}${verifyDev.route}`);
		expect(await res.text()).toContain(verifyDev.expectedText);

		if (verifyDev.configChanges) {
			const { configChanges } = verifyDev;
			const updatedVars = configChanges.vars;

			restoreConfig = updateWranglerConfig(projectPath, (config) => ({
				...config,
				vars: {
					...config.vars,
					...updatedVars,
				},
			}));

			await retry({ times: 10, sleepMs: 500 }, async () => {
				const res2 = await fetch(`http://127.0.0.1:${port}${verifyDev.route}`);
				expect(await res2.text()).toContain(configChanges.expectedText);
			});
		}
	} finally {
		// Kill the process gracefully so ports can be cleaned up
		await kill(proc);
		// Restore the wrangler config if we modified it
		restoreConfig?.();
		// Wait for a second to allow process to exit cleanly. Otherwise, the port might
		// end up camped and cause future runs to fail
		await setTimeout(1_000);
	}
}

export async function verifyPreviewScript(
	{ verifyPreview }: FrameworkTestConfig,
	{ previewScript }: TemplateConfig,
	projectPath: string,
	logStream: Writable,
) {
	if (!verifyPreview) {
		return;
	}

	assert(
		previewScript,
		"Expected a preview script is we are verifying the preview in " +
			projectPath,
	);
	if (verifyPreview.build) {
		await runCommand([packageManager.name, "run", "build"], {
			cwd: projectPath,
		});
	}

	// Run the dev-server on random ports to avoid colliding with other tests
	const port = await getPort();

	const proc = spawnWithLogging(
		[
			packageManager.name,
			"run",
			previewScript,
			...(packageManager.name === "npm" ? ["--"] : []),
			...(verifyPreview.previewArgs ?? []),
			"--port",
			`${port}`,
		],
		{
			cwd: projectPath,
			env: {
				VITEST: undefined,
				// Make sure we're not running frameworks with NODE_ENV: test, as that causes strange behaviour
				NODE_ENV: "production",
			},
		},
		logStream,
	);

	try {
		// Some frameworks take quite a long time to build the application (e.g. Docusaurus)
		// so wait some time for the dev-server to be ready.
		await retry(
			{ times: 60, sleepMs: 5_000 },
			async () => await fetch(`http://localhost:${port}${verifyPreview.route}`),
		);

		// Make a request to the specified test route
		const res = await fetch(`http://localhost:${port}${verifyPreview.route}`);
		expect(await res.text()).toContain(verifyPreview.expectedText);
	} finally {
		// Kill the process gracefully so ports can be cleaned up
		await kill(proc);
		// Wait for a second to allow process to exit cleanly. Otherwise, the port might
		// end up camped and cause future runs to fail
		await setTimeout(1_000);
	}
}

export async function verifyTypes(
	{ nodeCompat, verifyTypes: verify }: FrameworkTestConfig,
	{
		workersTypes,
		typesPath = "./worker-configuration.d.ts",
		envInterfaceName = "Env",
	}: TemplateConfig,
	projectPath: string,
) {
	if (workersTypes === "none" || verify === false) {
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
	const tsconfig = jsonc.parse(readFile(tsconfigPath));

	// Skip tsconfig verification if project uses TypeScript project references
	// C3 doesn't modify the root tsconfig in this case - types are defined in child tsconfigs
	if (Array.isArray(tsconfig.references) && tsconfig.references.length > 0) {
		return;
	}

	const tsconfigTypes = tsconfig.compilerOptions?.types;
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
}

export async function verifyCloudflareVitePluginConfigured(
	{ verifyCloudflareVitePluginConfigured: verify }: FrameworkTestConfig,
	projectPath: string,
) {
	if (!verify) {
		return;
	}

	const viteConfigTsPAth = join(projectPath, `vite.config.ts`);
	const viteConfigJsPath = join(projectPath, `vite.config.js`);

	let viteConfigPath: string;

	if (existsSync(viteConfigTsPAth)) {
		viteConfigPath = viteConfigTsPAth;
	} else if (existsSync(viteConfigJsPath)) {
		viteConfigPath = viteConfigJsPath;
	} else {
		throw new Error("Could not find Vite config file to modify");
	}

	const prePackageJson = JSON.parse(
		readFile(join(projectPath, "package.json")),
	) as { devDependencies: Record<string, string> };

	expect(
		prePackageJson.devDependencies?.["@cloudflare/vite-plugin"],
	).not.toBeUndefined();

	const viteConfig = readFile(viteConfigPath);

	expect(viteConfig).toContain(
		'import { cloudflare } from "@cloudflare/vite-plugin"',
	);
	expect(viteConfig).toMatch(/plugins:\s*?\[.*?cloudflare.*?]/);
}

export function shouldRunTest(testConfig: FrameworkTestConfig) {
	return (
		// Skip if the test is quarantined
		testConfig.quarantine !== true &&
		// Skip if the package manager is unsupported
		!testConfig.unsupportedPms?.includes(testPackageManager) &&
		// Skip if the OS is unsupported
		!testConfig.unsupportedOSs?.includes(process.platform)
	);
}

/**
 * Gets the framework config and test info given a `frameworkKey`.
 *
 * Some frameworks support both Pages and Workers platform variants.
 * If so, then the test must specify the variant in its key, of the form
 * `<frameworkId>:<"pages"|"workers">`.
 */
export function getFrameworkConfig(frameworkKey: string) {
	const frameworkMap = getFrameworkMap({
		experimental: isExperimental,
	});
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

/**
 * Test that C3 added a git commit with the correct message.
 */
export async function testGitCommitMessage(
	projectName: string,
	framework: string,
	projectPath: string,
) {
	const commitMessage = await runCommand(["git", "log", "-1"], {
		silent: true,
		cwd: projectPath,
	});

	expect(commitMessage).toMatch(
		/Initialize web application via create-cloudflare CLI/,
	);
	expect(commitMessage).toContain(`C3 = create-cloudflare@${version}`);
	expect(commitMessage).toContain(`project name = ${projectName}`);
	expect(commitMessage).toContain(`framework = ${framework}`);
}

/**
 * Test that we pushed the commit message to the deployment correctly.
 */
export async function testDeploymentCommitMessage(
	projectName: string,
	framework: string,
) {
	const projectLatestCommitMessage = await retry({ times: 5 }, async () => {
		// Wait for 2 seconds between each attempt
		await setTimeout(2_000);
		// Note: we cannot simply run git and check the result since the commit can be part of the
		//       deployment even without git, so instead we fetch the deployment info from the pages api
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
			{
				headers: {
					Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
				},
			},
		);

		const result = (
			(await response.json()) as {
				result: {
					name: string;
					latest_deployment?: {
						deployment_trigger: {
							metadata?: {
								commit_message: string;
							};
						};
					};
				}[];
			}
		).result;

		const commitMessage = result.find((project) => project.name === projectName)
			?.latest_deployment?.deployment_trigger?.metadata?.commit_message;
		if (!commitMessage) {
			throw new Error("Could not find deployment with name " + projectName);
		}
		return commitMessage;
	});

	expect(projectLatestCommitMessage).toMatch(
		/Initialize web application via create-cloudflare CLI/,
	);
	expect(projectLatestCommitMessage).toContain(
		`C3 = create-cloudflare@${version}`,
	);
	expect(projectLatestCommitMessage).toContain(`project name = ${projectName}`);
	expect(projectLatestCommitMessage).toContain(`framework = ${framework}`);
}
