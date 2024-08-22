import { existsSync, mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "vitest";
import { version } from "../package.json";
import { frameworkToTest } from "./frameworkToTest";
import {
	createTestLogStream,
	isQuarantineMode,
	keys,
	recreateLogFolder,
	runC3,
} from "./helpers";
import type { WriteStream } from "fs";
import type { Suite } from "vitest";

// Note: skipIf(frameworkToTest) makes it so that all the basic C3 functionality
//       tests are skipped in case we are testing a specific framework
describe.skipIf(frameworkToTest || isQuarantineMode())(
	"E2E: Basic C3 functionality ",
	() => {
		const tmpDirPath = realpathSync(mkdtempSync(join(tmpdir(), "c3-tests")));
		const projectPath = join(tmpDirPath, "basic-tests");
		let logStream: WriteStream;

		beforeAll((ctx) => {
			recreateLogFolder(ctx as Suite);
		});

		beforeEach((ctx) => {
			rmSync(projectPath, { recursive: true, force: true });
			logStream = createTestLogStream(ctx);
		});

		afterEach(() => {
			if (existsSync(projectPath)) {
				rmSync(projectPath, { recursive: true });
			}
		});

		test("--version", async () => {
			const { output } = await runC3(["--version"], [], logStream);
			expect(output).toEqual(version);
		});

		test("--version with positionals", async () => {
			const argv = ["foo", "bar", "baz", "--version"];
			const { output } = await runC3(argv, [], logStream);
			expect(output).toEqual(version);
		});

		test("--version with flags", async () => {
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

		test.skipIf(process.platform === "win32")(
			"Using arrow keys + enter",
			async () => {
				const { output } = await runC3(
					[projectPath],
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
							input: [keys.left, keys.enter],
						},
					],
					logStream,
				);

				expect(projectPath).toExist();
				expect(output).toContain(`category Hello World example`);
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang TypeScript`);
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);

		test.skipIf(process.platform === "win32")(
			"Typing custom responses",
			async () => {
				const { output } = await runC3(
					[],
					[
						{
							matcher:
								/In which directory do you want to create your application/,
							input: [projectPath, keys.enter],
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

				expect(projectPath).toExist();
				expect(output).toContain(`type Scheduled Worker (Cron Trigger)`);
				expect(output).toContain(`lang JavaScript`);
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);

		test.skipIf(process.platform === "win32")(
			"Mixed args and interactive",
			async () => {
				const { output } = await runC3(
					[projectPath, "--ts", "--no-deploy"],
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

				expect(projectPath).toExist();
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang TypeScript`);
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);

		test.skipIf(process.platform === "win32")(
			"Cloning remote template with full GitHub URL",
			async () => {
				const { output } = await runC3(
					[
						projectPath,
						"--template=https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-router",
						"--no-deploy",
						"--git=false",
					],
					[],
					logStream,
				);

				expect(output).toContain(
					`repository https://github.com/cloudflare/workers-sdk/tree/main/templates/worker-router`,
				);
				expect(output).toContain(
					`Cloning template from: github:cloudflare/workers-sdk/templates/worker-router`,
				);
				expect(output).toContain(`template cloned and validated`);
			},
		);

		test.skipIf(process.platform === "win32")(
			"Inferring the category, type and language if the type is `hello-world-python`",
			async () => {
				// The `hello-world-python` template is now the python variant of the `hello-world` template
				const { output } = await runC3(
					[
						projectPath,
						"--type=hello-world-python",
						"--no-deploy",
						"--git=false",
					],
					[],
					logStream,
				);

				expect(projectPath).toExist();
				expect(output).toContain(`category Hello World example`);
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang Python`);
			},
		);

		test.skipIf(process.platform === "win32")(
			"Selecting template by description",
			async () => {
				const { output } = await runC3(
					[projectPath, "--no-deploy", "--git=false"],
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

				expect(projectPath).toExist();
				expect(output).toContain(`category Application Starter`);
				expect(output).toContain(`type API starter (OpenAPI compliant)`);
			},
		);

		test.skipIf(process.platform === "win32")(
			"Going back and forth between the category, type, framework and lang prompts",
			async () => {
				const { output } = await runC3(
					[projectPath, "--git=false", "--no-deploy"],
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

				expect(projectPath).toExist();
				expect(output).toContain(`type Hello World Worker`);
				expect(output).toContain(`lang JavaScript`);
			},
		);
	},
);
