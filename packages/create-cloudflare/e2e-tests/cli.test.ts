import { beforeAll, describe, expect } from "vitest";
import { version } from "../package.json";
import { getFrameworkToTest } from "./frameworkToTest";
import {
	isQuarantineMode,
	keys,
	recreateLogFolder,
	runC3,
	test,
} from "./helpers";
import type { Suite } from "vitest";

const experimental = Boolean(process.env.E2E_EXPERIMENTAL);
const frameworkToTest = getFrameworkToTest({ experimental: false });

// Note: skipIf(frameworkToTest) makes it so that all the basic C3 functionality
//       tests are skipped in case we are testing a specific framework
describe.skipIf(experimental || frameworkToTest || isQuarantineMode())(
	"E2E: Basic C3 functionality ",
	() => {
		beforeAll((ctx) => {
			recreateLogFolder({ experimental }, ctx as Suite);
		});

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

		test({ experimental }).skipIf(process.platform === "win32")(
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
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang TypeScript`);
				expect(output).toContain(`no git`);
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
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);

		test({ experimental }).skipIf(process.platform === "win32")(
			"Mixed args and interactive",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[project.path, "--ts", "--no-deploy"],
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
							matcher: /Do you want to use git for version control/,
							input: ["n"],
						},
					],
					logStream,
				);

				expect(project.path).toExist();
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang TypeScript`);
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);

		test({ experimental }).skipIf(process.platform === "win32")(
			"Cloning remote template with full GitHub URL",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[
						project.path,
						"--template=https://github.com/cloudflare/templates/worker-router",
						"--no-deploy",
						"--git=false",
					],
					[],
					logStream,
				);

				expect(output).toContain(
					`repository https://github.com/cloudflare/templates/worker-router`,
				);
				expect(output).toContain(
					`Cloning template from: https://github.com/cloudflare/templates/worker-router`,
				);
				expect(output).toContain(`template cloned and validated`);
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
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang Python`);
			},
		);

		test({ experimental }).skipIf(process.platform === "win32")(
			"Selecting template by description",
			async ({ logStream, project }) => {
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
			},
		);

		test({ experimental }).skipIf(process.platform === "win32")(
			"Going back and forth between the category, type, framework and lang prompts",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[project.path, "--git=false", "--no-deploy"],
					[
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
								target: "Hello World Worker Using Durable Objects",
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
								target: "Hello World Worker",
								assertDefaultSelection:
									"Hello World Worker Using Durable Objects",
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
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang JavaScript`);
			},
		);
	},
);
