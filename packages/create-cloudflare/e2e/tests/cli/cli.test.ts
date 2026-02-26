import { execSync } from "node:child_process";
import fs from "node:fs";
import { basename, join, resolve } from "node:path";
import { detectPackageManager } from "helpers/packageManagers";
// eslint-disable-next-line workers-sdk/no-vitest-import-expect -- e2e test with complex patterns
import { beforeAll, describe, expect } from "vitest";
import { version } from "../../../package.json";
import {
	CLOUDFLARE_API_TOKEN,
	isExperimental,
	isWindows,
	keys,
} from "../../helpers/constants";
import { test } from "../../helpers/index";
import { recreateLogFolder } from "../../helpers/log-stream";
import { runC3 } from "../../helpers/run-c3";

const { name: pm } = detectPackageManager();

describe("Create Cloudflare CLI", () => {
	beforeAll((ctx) => {
		recreateLogFolder(ctx);
	});

	describe.skipIf(isExperimental)("E2E: Basic C3 functionality ", () => {
		test("--version", async ({ logStream }) => {
			const { output } = await runC3(["--version"], [], logStream);
			expect(output).toEqual(version);
		});

		test("--version with positionals", async ({ logStream }) => {
			const argv = ["foo", "bar", "baz", "--version"];
			const { output } = await runC3(argv, [], logStream);
			expect(output).toEqual(version);
		});

		test("--version with flags", async ({ logStream }) => {
			const argv = [
				"foo",
				"--type",
				"web-framework",
				"--no-deploy",
				"--version",
			];
			const { output } = await runC3(argv, [], logStream);
			expect(output).toEqual(version);
		});

		test.skipIf(isWindows || isExperimental)(
			"Using arrow keys + enter",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[project.path],
					[
						{
							matcher: /What would you like to start with\?/,
							input: [keys.enter],
						},
						{
							matcher: /Which template would you like to use\?/,
							input: [keys.enter],
						},
						{
							matcher: /Which language do you want to use\?/,
							input: [keys.enter],
						},
						{
							matcher: /Do you want to add an AGENTS\.md file/,
							input: ["n"],
						},
						{
							matcher: /Do you want to use git for version control/,
							input: [keys.right, keys.enter],
						},
						{
							matcher: /Do you want to deploy your application/,
							input: [keys.enter],
						},
					],
					logStream,
				);

				expect(project.path).toExist();
				expect(output).toContain(`category Hello World example`);
				expect(output).toContain(`type SSR / full-stack app`);
				expect(output).toContain(`lang TypeScript`);
				expect(output).toContain(`no deploy`);
			},
		);

		test.skipIf(isWindows)(
			"Typing custom responses",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[],
					[
						{
							matcher:
								/In which directory do you want to create your application/,
							input: [project.path, keys.enter],
						},
						{
							matcher: /What would you like to start with\?/,
							input: [keys.down, keys.down, keys.enter],
						},
						{
							matcher: /Which template would you like to use\?/,
							input: [keys.enter],
						},
						{
							matcher: /Which language do you want to use\?/,
							input: [keys.down, keys.enter],
						},
						{
							matcher: /Do you want to add an AGENTS\.md file/,
							input: ["n"],
						},
						{
							matcher: /Do you want to use git for version control/,
							input: ["n"],
						},
						{
							matcher: /Do you want to deploy your application/,
							input: ["n"],
						},
					],
					logStream,
				);

				expect(project.path).toExist();
				expect(output).toContain(`type Scheduled Worker (Cron Trigger)`);
				expect(output).toContain(`lang JavaScript`);
				expect(output).toContain(`no deploy`);
			},
		);

		test.skipIf(isWindows)(
			"Mixed args and interactive",
			async ({ logStream, project }) => {
				const projectName = basename(project.path);
				const existingProjectName = Array.from(projectName).reverse().join("");
				const existingProjectPath = project.path.replace(
					projectName,
					existingProjectName,
				);
				const existingFilePath = `${existingProjectPath}/example.json`;

				try {
					// Prepare an existing project with a file
					fs.mkdirSync(existingProjectPath, { recursive: true });
					fs.writeFileSync(existingFilePath, `"Hello World"`);

					const { output } = await runC3(
						[existingProjectPath, "--ts", "--no-deploy"],
						[
							// c3 will ask for a new project name as the provided one already exists
							{
								matcher:
									/In which directory do you want to create your application/,
								input: {
									type: "text",
									chunks: [project.path, keys.enter],
									assertErrorMessage: `ERROR  Directory \`${existingProjectPath}\` already exists and contains files that might conflict. Please choose a new name.`,
								},
							},
							{
								matcher: /What would you like to start with\?/,
								input: [keys.enter],
							},
							{
								matcher: /Which template would you like to use\?/,
								input: [keys.enter],
							},
							{
								matcher: /Do you want to add an AGENTS\.md file/,
								input: ["n"],
							},
							{
								matcher: /Do you want to use git for version control/,
								input: ["n"],
							},
						],
						logStream,
					);

					expect(project.path).toExist();
					expect(output).toContain(`type SSR / full-stack app`);
					expect(output).toContain(`lang TypeScript`);
					expect(output).toContain(`no deploy`);
				} finally {
					// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- see e2e/helpers/log-stream.ts for rationale
					fs.rmSync(existingFilePath, {
						recursive: true,
						force: true,
						maxRetries: 5,
						retryDelay: 100,
					});
				}
			},
		);

		test.skipIf(isWindows)(
			"Cloning remote template with full GitHub URL",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[
						project.path,
						"--template=https://github.com/cloudflare/workers-graphql-server",
						"--no-deploy",
						"--git=false",
						"--no-agents",
					],
					[],
					logStream,
				);

				expect(output).toContain(
					`repository https://github.com/cloudflare/workers-graphql-server`,
				);
				expect(output).toContain(
					`Cloning template from: https://github.com/cloudflare/workers-graphql-server`,
				);
				expect(output).toContain(`template cloned and validated`);
			},
		);

		// Skipping this on npm because the template that we are downloading has a package-lock file that
		// contains checksum that won't match the locally published packages we put in the Verdaccio mock npm registry.
		// Otherwise `npm install`, which C3 does, will error with messages like:
		//
		// ```
		// ERROR  Error: npm warn tarball tarball data for wrangler@http://localhost:61599/wrangler/-/wrangler-4.7.0.tgz
		// (sha512-5LoyNxpPG8K0kcU43Ossyj7+Hq78v8BNtu7ZNNSxDOUcairMEDwcbrbUOqzu/iM4yHiri5wCjl4Ja57fKED/Sg==) seems to be corrupted.
		// ```
		test.skipIf(isWindows || pm === "npm")(
			"Cloning remote template that uses wrangler.json",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[
						project.path,
						"--template=cloudflare/templates/multiplayer-globe-template",
						"--no-deploy",
						"--git=false",
						"--no-agents",
					],
					[],
					logStream,
				);

				expect(output).toContain(
					`repository cloudflare/templates/multiplayer-globe-template`,
				);
				expect(output).toContain(
					`Cloning template from: cloudflare/templates/multiplayer-globe-template`,
				);
				expect(output).toContain(`template cloned and validated`);
				// the template fails between these two assertions. however, the
				// underlying issue appears to be with the packages pinned in
				// the template - not whether or not the settings.json file is
				// created
				expect(fs.readFileSync(`${project.path}/.vscode/settings.json`, "utf8"))
					.toMatchInlineSnapshot(`
					"{
						"files.associations": {
							"wrangler.json": "jsonc"
						}
					}"
				`);
			},
		);

		test.skipIf(isWindows)(
			"Inferring the category, type and language if the type is `hello-world-python`",
			async ({ logStream, project }) => {
				// The `hello-world-python` template is now the python variant of the `hello-world` template
				const { output } = await runC3(
					[
						project.path,
						"--type=hello-world-python",
						"--no-deploy",
						"--git=false",
						"--no-agents",
					],
					[],
					logStream,
				);

				expect(project.path).toExist();
				expect(output).toContain(`category Hello World example`);
				expect(output).toContain(`type Worker only`);
				expect(output).toContain(`lang Python`);
			},
		);

		test.skipIf(isWindows)(
			"Filtering templates when --lang=python is specified",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[
						project.path,
						"--lang=python",
						"--type=hello-world",
						"--no-deploy",
						"--git=false",
						"--no-agents",
					],
					[],
					logStream,
				);

				expect(project.path).toExist();
				expect(output).toContain(`category Hello World example`);
				expect(output).toContain(`type Worker only`);
				expect(output).toContain(`lang Python`);
			},
		);

		test.skipIf(isWindows)(
			"Error when --lang=python is used with a category that has no Python templates",
			async ({ logStream, project }) => {
				const { errors } = await runC3(
					[
						project.path,
						"--lang=python",
						"--category=demo",
						"--no-deploy",
						"--git=false",
					],
					[],
					logStream,
				);

				expect(errors).toContain(
					`No templates available for language "python" in the "demo" category`,
				);
			},
		);

		/*
		 * Skipping in yarn due to node version resolution conflict
		 * The Openapi C3 template depends on `chanfana`, which has a dependency
		 * on `yargs-parser`. The latest chanfana version(`2.8.1` at the time
		 * of this writing) has a dep on `yargs-parser@22` which requires a
		 * node version of `20.19.0` or higher. Our CI is currently using node
		 * version `20.11.1`. We currently can't bump the CI node version as other
		 * tests will fail, therefore skipping for now until we can properly fix
		 */
		test.skipIf(isWindows || pm === "yarn")(
			"Selecting template by description",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[project.path, "--no-deploy", "--git=false", "--no-agents"],
					[
						{
							matcher: /What would you like to start with\?/,
							input: {
								type: "select",
								target: "Application Starter",
								assertDescriptionText:
									"Select from a range of starter applications using various Cloudflare products",
							},
						},
						{
							matcher: /Which template would you like to use\?/,
							input: {
								type: "select",
								target: "API starter (OpenAPI compliant)",
								assertDescriptionText:
									"Get started building a basic API on Workers",
							},
						},
					],
					logStream,
				);

				expect(project.path).toExist();
				expect(output).toContain(`category Application Starter`);
				expect(output).toContain(`type API starter (OpenAPI compliant)`);
			},
		);

		test.skipIf(isWindows)(
			"Going back and forth between the category, type, framework and lang prompts",
			async ({ logStream, project }) => {
				const testProjectPath = "/test-project-path";
				const { output } = await runC3(
					[testProjectPath, "--git=false", "--no-deploy", "--no-agents"],
					[
						{
							matcher: /What would you like to start with\?/,
							input: {
								type: "select",
								target: "Go back",
							},
						},
						{
							matcher:
								/In which directory do you want to create your application/,
							input: [project.path, keys.enter],
						},
						{
							matcher: /What would you like to start with\?/,
							input: {
								type: "select",
								target: "Application Starter",
							},
						},
						{
							matcher: /Which template would you like to use\?/,
							input: {
								type: "select",
								target: "Queue consumer & producer Worker",
							},
						},
						{
							matcher: /Which language do you want to use\?/,
							input: {
								type: "select",
								target: "Go back",
							},
						},
						{
							matcher: /Which template would you like to use\?/,
							input: {
								type: "select",
								target: "Go back",
								assertDefaultSelection: "Queue consumer & producer Worker",
							},
						},
						{
							matcher: /What would you like to start with\?/,
							input: {
								type: "select",
								target: "Framework Starter",
								assertDefaultSelection: "Application Starter",
							},
						},
						{
							matcher: /Which development framework do you want to use\?/,
							input: {
								type: "select",
								target: "Go back",
							},
						},
						{
							matcher: /What would you like to start with\?/,
							input: {
								type: "select",
								target: "Hello World example",
								assertDefaultSelection: "Framework Starter",
							},
						},
						{
							matcher: /Which template would you like to use\?/,
							input: {
								type: "select",
								target: "Worker + Durable Objects",
							},
						},
						{
							matcher: /Which language do you want to use\?/,
							input: {
								type: "select",
								target: "Go back",
							},
						},
						{
							matcher: /Which template would you like to use\?/,
							input: {
								type: "select",
								target: "Worker only",
								assertDefaultSelection: "Worker + Durable Objects",
							},
						},
						{
							matcher: /Which language do you want to use\?/,
							input: {
								type: "select",
								target: "JavaScript",
							},
						},
					],
					logStream,
				);

				expect(project.path).toExist();
				expect(output).toContain(`type Worker only`);
				expect(output).toContain(`lang JavaScript`);
			},
		);

		test.skipIf(isWindows || pm === "yarn" || !CLOUDFLARE_API_TOKEN)(
			"--existing-script",
			{ timeout: 120_000 },
			async ({ logStream, project }) => {
				// Ensure the worker to download exists
				try {
					if (
						(
							await fetch(
								"https://existing-script-test-do-not-delete.devprod-testing7928.workers.dev/",
							)
						).status === 404
					) {
						throw new Error("Remote worker not found");
					}
				} catch {
					// eslint-disable-next-line no-console
					console.log(
						"Redeploying the existing-script-test-do-not-delete worker",
					);
					const workerPath = resolve(
						__dirname,
						"fixtures/existing-script-test-do-not-delete",
					);
					execSync("pnpx wrangler@latest deploy", { cwd: workerPath });
				}

				const { output } = await runC3(
					[
						project.path,
						"--existing-script=existing-script-test-do-not-delete",
						"--git=false",
						"--no-deploy",
						"--no-agents",
					],
					[],
					logStream,
				);
				expect(output).toContain("Pre-existing Worker (from Dashboard)");
				expect(output).toContain("Application created successfully!");
				expect(fs.existsSync(join(project.path, "wrangler.jsonc"))).toBe(true);
				expect(fs.existsSync(join(project.path, "wrangler.json"))).toBe(false);
				expect(fs.existsSync(join(project.path, "wrangler.toml"))).toBe(false);
				expect(
					JSON.parse(
						fs.readFileSync(join(project.path, "wrangler.jsonc"), "utf8"),
					),
				).toMatchObject({ vars: { FOO: "bar" } });
			},
		);
	});

	describe("help text", () => {
		test("--help", async ({ logStream }) => {
			if (isExperimental) {
				const { output } = await runC3(
					["--help", "--experimental"],
					[],
					logStream,
				);
				expect(normalizeOutput(output)).toMatchInlineSnapshot(`
					"create-cloudflare <version>
					  The create-cloudflare CLI (also known as C3) is a command-line tool designed to help you set up and deploy new applications to Cloudflare. In addition to speed, it leverages officially developed templates for Workers and framework-specific setup guides to ensure each new application that you set up follows Cloudflare and any third-party best practices for deployment on the Cloudflare network.
					USAGE
					  <USAGE>
					OPTIONS
					You have selected experimental mode - the options below are filtered to those that support experimental mode.
					  directory
					    The directory where the application should be created. Also used as the name of the application.
					    If a path is provided that includes intermediary directories, only the base name will be used as the name of the application.
					  --category=<value>
					    Specifies the kind of templates that should be created
					    Allowed Values:
					      web-framework
					        Framework Starter
					  --type=<value>, -t
					    When using a built-in template, specifies the type of application that should be created.
					    Note that "--category" and "--template" are mutually exclusive options. If both are provided, "--category" will be used.
					  --framework=<value>, -f
					    The type of framework to use to create a web application (when using this option "--category" is coerced to "web-framework")
					    When using the --framework option, C3 will dispatch to the official creation tool used by the framework (e.g. "create-astro" is used for Astro).
					    You may specify additional arguments to be passed directly to these underlying tools by adding them after a "--" argument, like so:
					    npm create cloudflare -- --framework svelte -- --types=ts
					    pnpm create cloudflare --framework svelte -- --types=ts
					    Allowed Values:
					      analog, angular, astro, docusaurus, gatsby, next, nuxt, qwik, react, react-router, redwood, solid, svelte, tanstack-start, vike, vue, waku
					  --platform=<value>
					    Whether the application should be deployed to Pages or Workers. This is only applicable for Frameworks templates that support both Pages and Workers.
					    Allowed Values:
					      workers
					        Create a web application that can be deployed to Workers.
					      pages
					        Create a web application that can be deployed to Pages.
					  --variant=<value>
					    The variant of the framework to use. This is only applicable for certain frameworks that support multiple variants (e.g. React with TypeScript, TypeScript + SWC, JavaScript, JavaScript + SWC).
					  --lang=<value>
					    The programming language of the template
					    Allowed Values:
					      ts, js, python
					  --deploy, --no-deploy
					    Deploy your application after it has been created
					  --git, --no-git
					    Initialize a local git repository for your application
					  --agents, --no-agents
					    Add an AGENTS.md file to provide AI coding agents with guidance for the Cloudflare platform
					  --open, --no-open
					    Opens the deployed application in your browser (this option is ignored if the application is not deployed)
					  --existing-script=<value>
					    The name of an existing Cloudflare Workers script to clone locally (when using this option "--type" is coerced to "pre-existing").
					    When "--existing-script" is specified, "deploy" will be ignored.
					  --template=<value>
					    An external template to be used when creating your project.
					    Any "degit" compatible string may be specified. For example:
					    npm create cloudflare my-project -- --template github:user/repo
					    npm create cloudflare my-project -- --template git@github.com:user/repo
					    npm create cloudflare my-project -- --template https://github.com/user/repo
					    npm create cloudflare my-project -- --template git@github.com:user/repo#dev (branch)
					    npm create cloudflare my-project -- --template git@github.com:user/repo#v1.2.3 (tag)
					    npm create cloudflare my-project -- --template git@github.com:user/repo#1234abcd (commit)
					    Note that subdirectories may also be used. For example:
					    npm create cloudflare -- --template https://github.com/cloudflare/workers-sdk/templates/worker-r2
					  --template-mode=<value>
					    The mechanism to use when fetching the template.
					    Can be either "git" or "tar". "tar" does not support fetching from private
					    repositories. By default, degit will use "tar" if the template is hosted on GitHub, BitBucket, GitLab, or git.sr.ht.
					    Otherwise, it will use "git".
					    Allowed Values:
					      git
					        Use git to fetch the template. Supports private repositories.
					      tar
					        Use tar to fetch the template. Only supported on public repositories hosted on GitHub, BitBucket, GitLab, or git.sr.ht.
					  --accept-defaults, --no-accept-defaults, -y
					    Use all the default C3 options (each can also be overridden by specifying it)
					  --auto-update, --no-auto-update
					    Automatically uses the latest version of C3"
				`);
			} else {
				const { output } = await runC3(["--help"], [], logStream);
				expect(normalizeOutput(output)).toMatchInlineSnapshot(`
					"create-cloudflare <version>
					  The create-cloudflare CLI (also known as C3) is a command-line tool designed to help you set up and deploy new applications to Cloudflare. In addition to speed, it leverages officially developed templates for Workers and framework-specific setup guides to ensure each new application that you set up follows Cloudflare and any third-party best practices for deployment on the Cloudflare network.
					USAGE
					  <USAGE>
					OPTIONS
					  directory
					    The directory where the application should be created. Also used as the name of the application.
					    If a path is provided that includes intermediary directories, only the base name will be used as the name of the application.
					  --category=<value>
					    Specifies the kind of templates that should be created
					    Allowed Values:
					      hello-world
					        Hello World Starter
					      web-framework
					        Framework Starter
					      demo
					        Application Starter
					      remote-template
					        Template from a GitHub repo
					  --type=<value>, -t
					    When using a built-in template, specifies the type of application that should be created.
					    Note that "--category" and "--template" are mutually exclusive options. If both are provided, "--category" will be used.
					    Allowed Values:
					      hello-world
					        For processing requests, transforming responses, or API endpoints
					      hello-world-assets-only
					        For static sites or when using your own backend. Uses Workers Static Assets.
					      hello-world-with-assets
					        For sites with a backend API, or server-side rendering (SSR). Uses Static Assets with a Worker.
					      hello-world-durable-object
					        For multiplayer apps using WebSockets, or when you need synchronization
					      hello-world-durable-object-with-assets
					        For full-stack applications requiring static assets, an API, and real-time coordination
					      hello-world-workflows
					        For multi-step applications that automatically retry, persist state, and run for minutes, hours, days or weeks
					      common
					        Create a Worker to route and forward requests to other services
					      scheduled
					        Create a Worker to be executed on a schedule for periodic (cron) jobs
					      queues
					        Get started with a Worker that processes background tasks and message batches with Cloudflare Queues
					      openapi
					        Get started building a basic API on Workers
					      pre-existing
					        Fetch a Worker initialized from the Cloudflare dashboard.
					  --framework=<value>, -f
					    The type of framework to use to create a web application (when using this option "--category" is coerced to "web-framework")
					    When using the --framework option, C3 will dispatch to the official creation tool used by the framework (e.g. "create-astro" is used for Astro).
					    You may specify additional arguments to be passed directly to these underlying tools by adding them after a "--" argument, like so:
					    npm create cloudflare -- --framework svelte -- --types=ts
					    pnpm create cloudflare --framework svelte -- --types=ts
					    Allowed Values:
					      analog, angular, astro, docusaurus, gatsby, hono, next, nuxt, qwik, react, react-router, redwood, solid, svelte, tanstack-start, vike, vue, waku
					  --platform=<value>
					    Whether the application should be deployed to Pages or Workers. This is only applicable for Frameworks templates that support both Pages and Workers.
					    Allowed Values:
					      workers
					        Create a web application that can be deployed to Workers.
					      pages
					        Create a web application that can be deployed to Pages.
					  --variant=<value>
					    The variant of the framework to use. This is only applicable for certain frameworks that support multiple variants (e.g. React with TypeScript, TypeScript + SWC, JavaScript, JavaScript + SWC).
					  --lang=<value>
					    The programming language of the template
					    Allowed Values:
					      ts, js, python
					  --deploy, --no-deploy
					    Deploy your application after it has been created
					  --git, --no-git
					    Initialize a local git repository for your application
					  --agents, --no-agents
					    Add an AGENTS.md file to provide AI coding agents with guidance for the Cloudflare platform
					  --open, --no-open
					    Opens the deployed application in your browser (this option is ignored if the application is not deployed)
					  --existing-script=<value>
					    The name of an existing Cloudflare Workers script to clone locally (when using this option "--type" is coerced to "pre-existing").
					    When "--existing-script" is specified, "deploy" will be ignored.
					  --template=<value>
					    An external template to be used when creating your project.
					    Any "degit" compatible string may be specified. For example:
					    npm create cloudflare my-project -- --template github:user/repo
					    npm create cloudflare my-project -- --template git@github.com:user/repo
					    npm create cloudflare my-project -- --template https://github.com/user/repo
					    npm create cloudflare my-project -- --template git@github.com:user/repo#dev (branch)
					    npm create cloudflare my-project -- --template git@github.com:user/repo#v1.2.3 (tag)
					    npm create cloudflare my-project -- --template git@github.com:user/repo#1234abcd (commit)
					    Note that subdirectories may also be used. For example:
					    npm create cloudflare -- --template https://github.com/cloudflare/workers-sdk/templates/worker-r2
					  --template-mode=<value>
					    The mechanism to use when fetching the template.
					    Can be either "git" or "tar". "tar" does not support fetching from private
					    repositories. By default, degit will use "tar" if the template is hosted on GitHub, BitBucket, GitLab, or git.sr.ht.
					    Otherwise, it will use "git".
					    Allowed Values:
					      git
					        Use git to fetch the template. Supports private repositories.
					      tar
					        Use tar to fetch the template. Only supported on public repositories hosted on GitHub, BitBucket, GitLab, or git.sr.ht.
					  --accept-defaults, --no-accept-defaults, -y
					    Use all the default C3 options (each can also be overridden by specifying it)
					  --auto-update, --no-auto-update
					    Automatically uses the latest version of C3"
				`);
			}
		});
	});

	describe("frameworks related", () => {
		["solid", "next"].forEach((framework) =>
			test(`error when trying to create a ${framework} app on Pages`, async ({
				logStream,
			}) => {
				const { errors } = await runC3(
					["--platform=pages", `--framework=${framework}`, "my-app"],
					[],
					logStream,
				);
				expect(errors).toMatch(
					/Error: The .*? framework doesn't support the "pages" platform/,
				);
			}),
		);

		test("error when using invalid --variant for React framework", async ({
			logStream,
		}) => {
			const { errors } = await runC3(
				[
					"my-app",
					"--framework=react",
					"--platform=workers",
					"--variant=invalid-variant",
					"--no-deploy",
					"--git=false",
				],
				[],
				logStream,
			);
			expect(errors).toContain(
				'Unknown variant "invalid-variant". Valid variants are: react-ts, react-swc-ts, react, react-swc',
			);
		});

		test("error when using invalid --variant for React Pages framework", async ({
			logStream,
		}) => {
			const { errors } = await runC3(
				[
					"my-app",
					"--framework=react",
					"--platform=pages",
					"--variant=invalid-variant",
					"--no-deploy",
					"--git=false",
				],
				[],
				logStream,
			);
			expect(errors).toContain(
				'Unknown variant "invalid-variant". Valid variants are: react-ts, react-swc-ts, react, react-swc',
			);
		});

		test("accepts --variant for React Pages framework without prompting", async ({
			logStream,
		}) => {
			const { output } = await runC3(
				[
					"my-app",
					"--framework=react",
					"--platform=pages",
					"--variant=react-ts",
					"--no-deploy",
					"--git=false",
				],
				[],
				logStream,
			);
			expect(output).toContain("--template react-ts");
			expect(output).not.toContain("Select a variant");
		});
	});
});

function normalizeOutput(output: string): string {
	return output
		.replaceAll("\r\n", "\n")
		.replaceAll(/\n\n+/g, "\n")
		.replace(/create-cloudflare v\d+\.\d+\.\d+/, "create-cloudflare <version>")
		.replace(/USAGE\n[^\n]+/, `USAGE\n  <USAGE>`);
}
