import { describe, expect, test, vi } from "vitest";
import { parseArgs } from "../args";

vi.mock("yargs/helpers", () => ({ hideBin: (x: unknown) => x }));

describe("Cli", () => {
	describe("parseArgs", () => {
		test("parsing the first argument as the projectName", async () => {
			const result = await parseArgs(["my-project"]);
			expect(result.projectName).toBe("my-project");
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
	});
});
