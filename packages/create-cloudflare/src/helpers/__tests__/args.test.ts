import { assert, describe, test, vi } from "vitest";
import { parseArgs } from "../args";

vi.mock("@cloudflare/cli");
vi.mock("yargs/helpers", () => ({ hideBin: (x: string[]) => x }));

describe("Cli", () => {
	describe("parseArgs", () => {
		test("no arguments provide", async ({ expect }) => {
			const result = await parseArgs([]);

			assert(result.type === "default");
			expect(result.args.projectName).toBeFalsy();
			expect(result.args.additionalArgs).toEqual([]);
		});

		test("parsing the first argument as the projectName", async ({
			expect,
		}) => {
			const result = await parseArgs(["my-project"]);

			assert(result.type === "default");
			expect(result.args.projectName).toBe("my-project");
		});

		test("too many positional arguments provided", async ({ expect }) => {
			const result = await parseArgs(["my-project", "123"]);

			assert(result.type === "unknown");
			expect(result.showHelpMessage).toBe(true);
			expect(result.args).not.toBe(null);
			expect(result.errorMessage).toBe(
				"Too many positional arguments provided",
			);
		});

		test("not parsing first argument as the projectName if it is after --", async ({
			expect,
		}) => {
			const result = await parseArgs(["--", "my-project"]);

			assert(result.type === "default");
			expect(result.args.projectName).toBeFalsy();
		});

		test("parsing optional C3 arguments correctly", async ({ expect }) => {
			const result = await parseArgs(["--framework", "angular", "--ts=true"]);

			assert(result.type === "default");
			expect(result.args.projectName).toBeFalsy();
			expect(result.args.framework).toEqual("angular");
			expect(result.args.ts).toEqual(true);
			expect(result.args.additionalArgs).toEqual([]);
		});

		test("parsing positional + optional C3 arguments correctly", async ({
			expect,
		}) => {
			const result = await parseArgs([
				"my-project",
				"--framework",
				"angular",
				"--deploy",
				"true",
				"--git=false",
			]);

			assert(result.type === "default");
			expect(result.args.projectName).toEqual("my-project");
			expect(result.args.framework).toEqual("angular");
			expect(result.args.deploy).toEqual(true);
			expect(result.args.git).toEqual(false);
			expect(result.args.additionalArgs).toEqual([]);
		});

		test("parsing optional C3 arguments + additional arguments correctly", async ({
			expect,
		}) => {
			const result = await parseArgs([
				"--framework",
				"react",
				"--ts=true",
				"--",
				"positional-arg",
				"--react-option",
				"5",
			]);

			assert(result.type === "default");
			expect(result.args.projectName).toBeFalsy();
			expect(result.args.framework).toEqual("react");
			expect(result.args.ts).toEqual(true);
			expect(result.args.additionalArgs).toEqual([
				"positional-arg",
				"--react-option",
				"5",
			]);
		});

		test("parsing positional + optional C3 arguments + additional arguments correctly", async ({
			expect,
		}) => {
			const result = await parseArgs([
				"my-react-project",
				"--framework",
				"react",
				"--ts=true",
				"--",
				"positional-arg",
				"--react-option",
				"5",
			]);

			assert(result.type === "default");
			expect(result.args.projectName).toBe("my-react-project");
			expect(result.args.framework).toEqual("react");
			expect(result.args.ts).toEqual(true);
			expect(result.args.additionalArgs).toEqual([
				"positional-arg",
				"--react-option",
				"5",
			]);
		});

		const stringArgs = ["framework", "template", "type", "existing-script"];
		test.for(stringArgs)("%s requires an argument", async (arg, { expect }) => {
			const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			await expect(
				parseArgs(["my-react-project", `--${arg}`]),
			).resolves.toEqual({
				type: "unknown",
				args: null,
			});
			expect(logSpy).toHaveBeenCalledWith(
				expect.stringContaining(`Not enough arguments following: ${arg}`),
			);
		});

		test("parsing template-mode correctly", async () => {
			const result = await parseArgs(["--template-mode", "git"]);

			assert(result.type === "default");
			assert(result.args.templateMode === "git");
		});

		test("template-mode correctly defaults to be undefined", async ({
			expect,
		}) => {
			const result = await parseArgs([
				"--template",
				"git@github.com:user/repo",
			]);

			assert(result.type === "default");
			expect(result.args.templateMode).toBeUndefined();
		});
	});
});
