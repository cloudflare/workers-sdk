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
							matcher: /What type of application do you want to create/,
							input: [keys.enter],
						},
						{
							matcher: /Do you want to use TypeScript/,
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
				expect(output).toContain(`type "Hello World" Worker`);
				expect(output).toContain(`yes typescript`);
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
							matcher: /What type of application do you want to create/,
							input: [keys.down, keys.down, keys.down, keys.down, keys.enter],
						},
						{
							matcher: /Do you want to use TypeScript/,
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

				expect(projectPath).toExist();
				expect(output).toContain(`type Example router & proxy Worker`);
				expect(output).toContain(`no typescript`);
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
							matcher: /What type of application do you want to create/,
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
				expect(output).toContain(`type "Hello World" Worker`);
				expect(output).toContain(`yes typescript`);
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);
	},
);
