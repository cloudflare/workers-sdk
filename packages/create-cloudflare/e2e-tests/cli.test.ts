import fs, { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { detectPackageManager } from "helpers/packageManagers";
import { beforeAll, describe, expect } from "vitest";
import { version } from "../package.json";
import { getFrameworkToTest } from "./frameworks/framework-to-test";
import {
	isQuarantineMode,
	keys,
	recreateLogFolder,
	runC3,
	test,
} from "./helpers";

const experimental = process.env.E2E_EXPERIMENTAL === "true";
const frameworkToTest = getFrameworkToTest({ experimental: false });
const { name: pm } = detectPackageManager();

beforeAll((ctx) => {
	recreateLogFolder({ experimental }, ctx);
});

// Note: skipIf(frameworkToTest) makes it so that all the basic C3 functionality
//       tests are skipped in case we are testing a specific framework
describe.skipIf(experimental || frameworkToTest || isQuarantineMode())(
	"E2E: Basic C3 functionality ",
	() => {
		test({ experimental })("--version", async ({ logStream }) => {
			const { output } = await runC3(["--version"], [], logStream);
			expect(output).toEqual(version);
		});

		test({ experimental })(
			"--version with positionals",
			async ({ logStream }) => {
				const argv = ["foo", "bar", "baz", "--version"];
				const { output } = await runC3(argv, [], logStream);
				expect(output).toEqual(version);
			},
		);

		test({ experimental })("--version with flags", async ({ logStream }) => {
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

		test({ experimental }).skipIf(process.platform === "win32" || experimental)(
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

		test({ experimental }).skipIf(process.platform === "win32")(
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

		test({ experimental }).skipIf(process.platform === "win32")(
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
					fs.rmSync(existingFilePath, {
						recursive: true,
						force: true,
						maxRetries: 10,
						retryDelay: 100,
					});
				}
			},
		);

		test({ experimental }).skipIf(process.platform === "win32")(
			"Cloning remote template with full GitHub URL",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[
						project.path,
						"--template=https://github.com/cloudflare/workers-graphql-server",
						"--no-deploy",
						"--git=false",
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
		test({ experimental }).skipIf(process.platform === "win32" || pm === "npm")(
			"Cloning remote template that uses wrangler.json",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[
						project.path,
						"--template=cloudflare/templates/multiplayer-globe-template",
						"--no-deploy",
						"--git=false",
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
				expect(readFileSync(`${project.path}/.vscode/settings.json`, "utf8"))
					.toMatchInlineSnapshot(`
					"{
						"files.associations": {
							"wrangler.json": "jsonc"
						}
					}"
				`);
			},
		);

		test({ experimental }).skipIf(process.platform === "win32")(
			"Inferring the category, type and language if the type is `hello-world-python`",
			async ({ logStream, project }) => {
				// The `hello-world-python` template is now the python variant of the `hello-world` template
				const { output } = await runC3(
					[
						project.path,
						"--type=hello-world-python",
						"--no-deploy",
						"--git=false",
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

		/*
		 * Skipping in yarn due to node version resolution conflict
		 * The Openapi C3 template depends on `chanfana`, which has a dependency
		 * on `yargs-parser`. The latest chanfana version(`2.8.1` at the time
		 * of this writting) has a dep on `yargs-parser@22` which requires a
		 * node version of `20.19.0` or higher. Our CI is currently using node
		 * version `20.11.1`. We currently can't bump the CI node version as other
		 * tests will fail, therefore skipping for now until we can properly fix
		 */
		test({ experimental }).skipIf(
			process.platform === "win32" || pm === "yarn",
		)("Selecting template by description", async ({ logStream, project }) => {
			const { output } = await runC3(
				[project.path, "--no-deploy", "--git=false"],
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
		});

		test({ experimental }).skipIf(process.platform === "win32")(
			"Going back and forth between the category, type, framework and lang prompts",
			async ({ logStream, project }) => {
				const testProjectPath = "/test-project-path";
				const { output } = await runC3(
					[testProjectPath, "--git=false", "--no-deploy"],
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

		test({ experimental }).skipIf(
			process.platform === "win32" || pm === "yarn",
		)("--existing-script", async ({ logStream, project }) => {
			const { output } = await runC3(
				[
					project.path,
					"--existing-script=existing-script-test-do-not-delete",
					"--git=false",
					"--no-deploy",
				],
				[],
				logStream,
			);
			expect(output).toContain("Pre-existing Worker (from Dashboard)");
			expect(output).toContain("Application created successfully!");
			expect(fs.existsSync(join(project.path, "wrangler.jsonc"))).toBe(false);
			expect(fs.existsSync(join(project.path, "wrangler.json"))).toBe(false);
			expect(
				fs.readFileSync(join(project.path, "wrangler.toml"), "utf8"),
			).toContain('FOO = "bar"');
		});
	},
);

describe.skipIf(frameworkToTest || isQuarantineMode())("help text", () => {
	test({ experimental })("--help", async ({ logStream }) => {
		if (experimental) {
			const { output } = await runC3(
				["--help", "--experimental"],
				[],
				logStream,
			);
			expect(normalizeOutput(output)).toMatchInlineSnapshot(`
				"create-cloudflare <version>
				  The create-cloudflare cli (also known as C3) is a command-line tool designed to help you set up and deploy new applications to Cloudflare. In addition to speed, it leverages officially developed templates for Workers and framework-specific setup guides to ensure each new application that you set up follows Cloudflare and any third-party best practices for deployment on the Cloudflare network.
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
				    When using the --framework option, C3 will dispatch to the official creation tool used by the framework (ex. "create-remix" is used for Remix).
				    You may specify additional arguments to be passed directly to these underlying tools by adding them after a "--" argument, like so:
				    npm create cloudflare -- --framework next -- --ts
				    pnpm create cloudflare --framework next -- --ts
				    Allowed Values:
				      solid
				  --platform=<value>
				    Whether the application should be deployed to Pages or Workers. This is only applicable for Frameworks templates that support both Pages and Workers.
				    Allowed Values:
				      workers
				        Create a web application that can be deployed to Workers.
				      pages
				        Create a web application that can be deployed to Pages.
				  --lang=<value>
				    The programming language of the template
				    Allowed Values:
				      ts, js, python
				  --deploy, --no-deploy
				    Deploy your application after it has been created
				  --git, --no-git
				    Initialize a local git repository for your application
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
				  The create-cloudflare cli (also known as C3) is a command-line tool designed to help you set up and deploy new applications to Cloudflare. In addition to speed, it leverages officially developed templates for Workers and framework-specific setup guides to ensure each new application that you set up follows Cloudflare and any third-party best practices for deployment on the Cloudflare network.
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
				    When using the --framework option, C3 will dispatch to the official creation tool used by the framework (ex. "create-remix" is used for Remix).
				    You may specify additional arguments to be passed directly to these underlying tools by adding them after a "--" argument, like so:
				    npm create cloudflare -- --framework next -- --ts
				    pnpm create cloudflare --framework next -- --ts
				    Allowed Values:
				      analog, angular, astro, docusaurus, gatsby, hono, next, nuxt, qwik, react, react-router, remix, solid, svelte, vue
				  --platform=<value>
				    Whether the application should be deployed to Pages or Workers. This is only applicable for Frameworks templates that support both Pages and Workers.
				    Allowed Values:
				      workers
				        Create a web application that can be deployed to Workers.
				      pages
				        Create a web application that can be deployed to Pages.
				  --lang=<value>
				    The programming language of the template
				    Allowed Values:
				      ts, js, python
				  --deploy, --no-deploy
				    Deploy your application after it has been created
				  --git, --no-git
				    Initialize a local git repository for your application
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

function normalizeOutput(output: string): string {
	return output
		.replaceAll("\r\n", "\n")
		.replaceAll(/\n\n+/g, "\n")
		.replace(/create-cloudflare v\d+\.\d+\.\d+/, "create-cloudflare <version>")
		.replace(/USAGE\n[^\n]+/, `USAGE\n  <USAGE>`);
}
