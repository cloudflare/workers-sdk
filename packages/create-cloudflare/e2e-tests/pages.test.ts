import { join } from "path";
import { FrameworkMap } from "frameworks/index";
import { readJSON } from "helpers/files";
import { fetch } from "undici";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
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
	const { getName, getPath, clean } = testProjectDir("pages");

	beforeEach((ctx) => {
		const framework = ctx.meta.name;
		clean(framework);
	});

	afterEach((ctx) => {
		const framework = ctx.meta.name;
		clean(framework);
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
		const projectName = getName(framework);

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
		astro: {
			expectResponseToContain: "Hello, Astronaut!",
		},
		hono: {
			expectResponseToContain: "/api/hello",
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

	// test.concurrent.each(Object.keys(frameworkTests))(
	test.each(Object.keys(frameworkTests))(
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
