import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

describe("completion", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	it("should provide completion command and generate completion script", async () => {
		await expect(runWrangler("completion")).rejects.toThrow(
			"Unknown argument: completion"
		);

		expect(std.out).toContain("###-begin-wrangler-completions-###");
		expect(std.out).toContain("_wrangler_yargs_completions");
		expect(std.out).toContain(
			"complete -o bashdefault -o default -F _wrangler_yargs_completions wrangler"
		);
	});

	it("should include installation instructions in completion script", async () => {
		await expect(runWrangler("completion")).rejects.toThrow(
			"Unknown argument: completion"
		);

		const output = std.out;
		expect(output).toContain("Installation: wrangler completion >> ~/.bashrc");
		expect(output).toContain("wrangler completion >> ~/.bash_profile on OSX");
	});
});
