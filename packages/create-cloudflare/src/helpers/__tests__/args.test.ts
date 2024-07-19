import { beforeEach, describe, expect, test, vi } from "vitest";
import { parseArgs } from "../args";
import type { MockInstance } from "vitest";

vi.mock("@cloudflare/cli");
vi.mock("yargs/helpers", () => ({ hideBin: (x: string[]) => x }));

describe("Cli", () => {
	let consoleErrorMock: MockInstance;

	beforeEach(() => {
		// mock `console.error` for all tests in order to avoid noise
		consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	describe("parseArgs", () => {
		test("no arguments provide", async () => {
			const result = await parseArgs([]);
			expect(result.projectName).toBeFalsy();
			expect(result.additionalArgs).toEqual([]);
		});

		test("parsing the first argument as the projectName", async () => {
			const result = await parseArgs(["my-project"]);
			expect(result.projectName).toBe("my-project");
		});

		test("too many positional arguments provided", async () => {
			const processExitMock = vi
				.spyOn(process, "exit")
				.mockImplementation(() => null as never);

			await parseArgs(["my-project", "123"]);

			expect(consoleErrorMock).toHaveBeenCalledWith(
				expect.stringMatching(/Too many positional arguments provided/),
			);
			expect(processExitMock).toHaveBeenCalledWith(1);
		});

		test("not parsing first argument as the projectName if it is after --", async () => {
			const result = await parseArgs(["--", "my-project"]);
			expect(result.projectName).toBeFalsy();
		});

		test("parsing optional C3 arguments correctly", async () => {
			const result = await parseArgs(["--framework", "angular", "--ts=true"]);
			expect(result.projectName).toBeFalsy();
			expect(result.framework).toEqual("angular");
			expect(result.ts).toEqual(true);
			expect(result.additionalArgs).toEqual([]);
		});

		test("parsing positional + optional C3 arguments correctly", async () => {
			const result = await parseArgs([
				"my-project",
				"--framework",
				"angular",
				"--deploy",
				"true",
				"--git=false",
			]);
			expect(result.projectName).toEqual("my-project");
			expect(result.framework).toEqual("angular");
			expect(result.deploy).toEqual(true);
			expect(result.git).toEqual(false);
			expect(result.additionalArgs).toEqual([]);
		});

		test("parsing optional C3 arguments + additional arguments correctly", async () => {
			const result = await parseArgs([
				"--framework",
				"react",
				"--ts=true",
				"--",
				"positional-arg",
				"--react-option",
				"5",
			]);
			expect(result.projectName).toBeFalsy();
			expect(result.framework).toEqual("react");
			expect(result.ts).toEqual(true);
			expect(result.additionalArgs).toEqual([
				"positional-arg",
				"--react-option",
				"5",
			]);
		});

		test("parsing positional + optional C3 arguments + additional arguments correctly", async () => {
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
			expect(result.projectName).toBe("my-react-project");
			expect(result.framework).toEqual("react");
			expect(result.ts).toEqual(true);
			expect(result.additionalArgs).toEqual([
				"positional-arg",
				"--react-option",
				"5",
			]);
		});

		const stringArgs = [
			"--framework",
			"--template",
			"--type",
			"--existing-script",
		];
		test.each(stringArgs)("%s requires an argument", async (arg) => {
			await expect(parseArgs(["my-react-project", arg])).rejects.toThrowError();
		});
	});
});
