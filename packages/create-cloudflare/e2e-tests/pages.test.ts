import { existsSync, mkdtempSync, realpathSync, rmSync } from "fs";
import crypto from "node:crypto";
import { tmpdir } from "os";
import { join } from "path";
import spawn from "cross-spawn";
import { FrameworkMap } from "frameworks/index";
import { readJSON } from "helpers/files";
import { fetch } from "undici";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import { keys, runC3 } from "./helpers";
import type { RunnerConfig } from "./helpers";

/*
Areas for future improvement:
- Add support for frameworks with global installs (like docusaurus, gatsby, etc)
*/

type FrameworkTestConfig = RunnerConfig & {
	expectResponseToContain: string;
};

describe("E2E: Web frameworks", () => {
	const tmpDirPath = realpathSync(mkdtempSync(join(tmpdir(), "c3-tests")));
	let projectPath: string;
	let projectName: string;

	beforeEach(() => {
		projectName = `c3-e2e-${crypto.randomBytes(4).toString("hex")}`;
		projectPath = join(tmpDirPath, projectName);
		rmSync(projectPath, { recursive: true, force: true });
	});

	afterEach(() => {
		if (existsSync(projectPath)) {
			rmSync(projectPath, { recursive: true });
		}

		spawn("npx", ["wrangler", "pages", "project", "delete", "-y", projectName]);
	});

	const runCli = async (
		framework: string,
		{ argv = [], promptHandlers = [], overrides }: RunnerConfig
	) => {
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

	const frameworkTests: Record<string, FrameworkTestConfig> = {
		astro: {
			expectResponseToContain: "Hello, Astronaut!",
		},
		hono: {
			expectResponseToContain: "/api/hello",
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
		qwik: {
			expectResponseToContain: "Welcome to Qwik",
			promptHandlers: [
				{
					matcher: /Yes looks good, finish update/,
					input: [keys.enter],
				},
			],
		},
		react: {
			expectResponseToContain: "React App",
		},
		remix: {
			expectResponseToContain: "Welcome to Remix",
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

	test.each(Object.keys(frameworkTests))("%s", async (name) => {
		await runCliWithDeploy(name);
	});

	test.skip("Hono (wrangler defaults)", async () => {
		await runCli("hono", { argv: ["--wrangler-defaults"] });
	});
});
