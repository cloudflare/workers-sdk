import { join } from "path";
import { FrameworkMap } from "frameworks/index";
import { readJSON } from "helpers/files";
import { fetch } from "undici";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { version } from '../package.json';
import { deleteProject } from "../scripts/e2eCleanup";
import { keys, runC3, testProjectDir } from "./helpers";
import type { RunnerConfig } from "./helpers";

/*
Areas for future improvement:
- Add support for frameworks with global installs (like docusaurus, gatsby, etc)
*/

type FrameworkTestConfig = RunnerConfig & {
	expectResponseToContain: string;
};

describe(`E2E: Web frameworks`, () => {
	const { getPath, getName, clean } = testProjectDir("pages");

	beforeEach((ctx) => {
		const framework = ctx.meta.name;
		clean(framework);
	});

	afterEach(async (ctx) => {
		const framework = ctx.meta.name;
		clean(framework);

		// Cleanup the pages project in case we need to retry it
		const projectName = getName(framework);
		try {
			await deleteProject(projectName);
		} catch (error) {
			console.error(`Failed to cleanup project: ${projectName}`);
			console.error(error);
		}
	});

	const runCli = async (
		framework: string,
		{ argv = [], promptHandlers = [], overrides }: RunnerConfig
	) => {
		const projectPath = getPath(framework);

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
		const { argv, overrides, promptHandlers, expectResponseToContain } =
			frameworkTests[framework];

		const { output } = await runCli(framework, {
			overrides,
			promptHandlers,
			argv: [...(argv ?? []), "--deploy", "--no-git"],
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

		const res = await fetch(projectUrl);
		expect(res.status).toBe(200);

		const body = await res.text();
		expect(
			body,
			`(${framework}) Deployed page (${projectUrl}) didn't contain expected string: "${expectResponseToContain}"`
		).toContain(expectResponseToContain);

		await testDeploymentCommitMessage(getName(framework), framework);
	};

	// These are ordered based on speed and reliability for ease of debugging
	const frameworkTests: Record<string, FrameworkTestConfig> = {
		astro: {
			expectResponseToContain: "Hello, Astronaut!",
		},
		hono: {
			expectResponseToContain: "Hello Hono!",
		},
		qwik: {
			expectResponseToContain: "Welcome to Qwik",
			promptHandlers: [
				{
					matcher: /Yes looks good, finish update/,
					input: [keys.enter],
				},
			],
		},
		remix: {
			expectResponseToContain: "Welcome to Remix",
		},
		next: {
			expectResponseToContain: "Create Next App",
			promptHandlers: [
				{
					matcher: /Do you want to use the next-on-pages eslint-plugin\?/,
					input: ["y"],
				},
			],
		},
		nuxt: {
			expectResponseToContain: "Welcome to Nuxt!",
			overrides: {
				packageScripts: {
					build: "NITRO_PRESET=cloudflare-pages nuxt build",
				},
			},
		},
		react: {
			expectResponseToContain: "React App",
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
		},
		vue: {
			expectResponseToContain: "Vite App",
		},
	};

	test.concurrent.each(Object.keys(frameworkTests))(
		"%s",
		async (name) => {
			await runCliWithDeploy(name);
		},
		{ retry: 3 }
	);

	test.skip("Hono (wrangler defaults)", async () => {
		await runCli("hono", { argv: ["--wrangler-defaults"] });
	});
});

const testDeploymentCommitMessage = async (
	projectName: string,
	framework: string
) => {
	// Note: we cannot simply run git and check the result since the commit can be part of the
	//       deployment even without git, so instead we fetch the deployment info from the pages api
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
		{
			headers: {
				Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
			},
		}
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

	const projectLatestCommitMessage = result.find(
		(project) => project.name === projectName
	)?.latest_deployment?.deployment_trigger?.metadata?.commit_message;
	expect(projectLatestCommitMessage).toMatch(
		/^Initialize web application via create-cloudflare CLI/
	);
	expect(projectLatestCommitMessage).toContain(
		`C3 = create-cloudflare@${version}`
	);
	expect(projectLatestCommitMessage).toContain(`project name = ${projectName}`);
	expect(projectLatestCommitMessage).toContain(`framework = ${framework}`);
};
