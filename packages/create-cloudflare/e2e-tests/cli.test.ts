import { existsSync, rmSync, mkdtempSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, afterEach, describe, test, expect } from "vitest";
import { version } from "../package.json";
import { keys, runC3 } from "./helpers";

describe("E2E: Basic C3 functionality", () => {
	const tmpDirPath = realpathSync(mkdtempSync(join(tmpdir(), "c3-tests")));
	const projectPath = join(tmpDirPath, "basic-tests");

	beforeEach(() => {
		rmSync(projectPath, { recursive: true, force: true });
	});

	afterEach(() => {
		if (existsSync(projectPath)) {
			rmSync(projectPath, { recursive: true });
		}
	});

	test("--version", async () => {
		const { output } = await runC3({ argv: ["--version"] });
		expect(output).toEqual(version);
	});

	test("--version with positionals", async () => {
		const argv = "foo bar baz --version".split(" ");
		const { output } = await runC3({ argv });
		expect(output).toEqual(version);
	});

	test("--version with flags", async () => {
		const argv = "foo --type webFramework --no-deploy --version".split(" ");
		const { output } = await runC3({ argv });
		expect(output).toEqual(version);
	});

	test("Using arrow keys + enter", async () => {
		const { output } = await runC3({
			argv: [projectPath],
			promptHandlers: [
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
		});

		expect(projectPath).toExist();
		expect(output).toContain(`type "Hello World" Worker`);
		expect(output).toContain(`yes typescript`);
		expect(output).toContain(`no git`);
		expect(output).toContain(`no deploy`);
	});

	test("Typing custom responses", async () => {
		const { output } = await runC3({
			argv: [],
			promptHandlers: [
				{
					matcher: /In which directory do you want to create your application/,
					input: [projectPath, keys.enter],
				},
				{
					matcher: /What type of application do you want to create/,
					input: [keys.down, keys.enter],
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
		});

		expect(projectPath).toExist();
		expect(output).toContain(`type Example router & proxy Worker`);
		expect(output).toContain(`no typescript`);
		expect(output).toContain(`no git`);
		expect(output).toContain(`no deploy`);
	});

	test("Mixed args and interactive", async () => {
		const { output } = await runC3({
			argv: [projectPath, "--ts", "--no-deploy"],
			promptHandlers: [
				{
					matcher: /What type of application do you want to create/,
					input: [keys.enter],
				},
				{
					matcher: /Do you want to use git for version control/,
					input: ["n"],
				},
			],
		});

		expect(projectPath).toExist();
		expect(output).toContain(`type "Hello World" Worker`);
		expect(output).toContain(`yes typescript`);
		expect(output).toContain(`no git`);
		expect(output).toContain(`no deploy`);
	});
});
