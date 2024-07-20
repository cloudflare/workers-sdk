import { beforeAll, describe, expect } from "vitest";
import { version } from "../package.json";
import { frameworkToTest } from "./frameworkToTest";
import {
	isQuarantineMode,
	keys,
	recreateLogFolder,
	runC3,
	test,
} from "./helpers";
import type { Suite } from "vitest";

// Note: skipIf(frameworkToTest) makes it so that all the basic C3 functionality
//       tests are skipped in case we are testing a specific framework
describe
	.skipIf(frameworkToTest || isQuarantineMode())
	.concurrent("E2E: Basic C3 functionality ", () => {
		beforeAll((ctx) => {
			recreateLogFolder(ctx as Suite);
		});

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

		test.skipIf(process.platform === "win32")(
			"Using arrow keys + enter",
			async ({ logStream, project }) => {
				console.log(project);
				try {
					const { output } = await runC3(
						[project.path],
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

					expect(project.path).toExist();
					expect(output).toContain(`type "Hello World" Worker`);
					expect(output).toContain(`yes typescript`);
					expect(output).toContain(`no git`);
					expect(output).toContain(`no deploy`);
				} catch (e) {
					console.error(e);
					throw e;
				}
			},
		);

		test.skipIf(process.platform === "win32")(
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
							matcher: /What type of application do you want to create/,
							input: [keys.down, keys.down, keys.down, keys.enter],
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

				expect(project.path).toExist();
				expect(output).toContain(`type Example router & proxy Worker`);
				expect(output).toContain(`no typescript`);
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);

		test.skipIf(process.platform === "win32")(
			"Mixed args and interactive",
			async ({ logStream, project }) => {
				const { output } = await runC3(
					[project.path, "--ts", "--no-deploy"],
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

				expect(project.path).toExist();
				expect(output).toContain(`type "Hello World" Worker`);
				expect(output).toContain(`yes typescript`);
				expect(output).toContain(`no git`);
				expect(output).toContain(`no deploy`);
			},
		);
	});
