import { execa } from "execa";
import { describe, expect, test } from "vitest";
import { version } from "../package.json";

describe("Basic C3 functionality", () => {
	const runCli = async (argv: string[]) => {
		const result = await execa("node", ["./dist/cli.js", ...argv], {
			stderr: process.stderr,
		});

		return result;
	};

	test("--version", async () => {
		const result = await runCli(["--version"]);
		expect(result.stdout).toContain(version);
	});

	test("--version with positionals", async () => {
		const argv = "foo bar baz --version".split(" ");
		const result = await runCli(argv);
		expect(result.stdout).toContain(version);
	});

	test("--version with flags", async () => {
		const argv = "foo --type webFramework --no-deploy --version".split(" ");
		const result = await runCli(argv);

		expect(result.stdout).toContain(version);
	});
});
