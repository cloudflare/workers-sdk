import { execSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";

function shellAvailable(shell: string): boolean {
	try {
		execSync(`which ${shell}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

describe("wrangler", () => {
	describe("complete", () => {
		const std = mockConsoleMethods();
		runInTempDir();

		describe("complete --", () => {
			test("should return top-level commands", async () => {
				await runWrangler('complete -- ""');

				expect(std.out).toContain("deploy\t");
				expect(std.out).toContain("dev\t");
				expect(std.out).toContain("kv\t");
			});

			test("should return subcommands for namespace", async () => {
				await runWrangler('complete -- kv ""');

				expect(std.out).toContain("namespace\t");
				expect(std.out).toContain("key\t");
			});

			test("should return flags for a command", async () => {
				await runWrangler("complete -- dev --");

				expect(std.out).toContain("--port\t");
				expect(std.out).toContain("--ip\t");
			});

			test("should not include internal commands", async () => {
				await runWrangler('complete -- ""');

				expect(std.out).toContain("deploy\t");
				expect(std.out).toContain("dev\t");
				// Internal commands like "_dev" should not be exposed
				expect(std.out).not.toMatch(/^_dev\t/m);
			});

			test("should handle deeply nested commands", async () => {
				await runWrangler('complete -- queues consumer http ""');

				expect(std.out).toContain("add\t");
				expect(std.out).toContain("remove\t");
			});

			test("should output tab-separated format", async () => {
				await runWrangler('complete -- ""');

				// Most lines should be "value\tdescription" format
				const lines = std.out.trim().split("\n");
				let tabSeparatedCount = 0;
				for (const line of lines) {
					if (line.trim() && !line.startsWith(":")) {
						if (line.includes("\t")) {
							tabSeparatedCount++;
						}
					}
				}
				// Most commands should have descriptions
				expect(tabSeparatedCount).toBeGreaterThan(10);
			});

			test("should return options with choices", async () => {
				await runWrangler('complete -- dev --log-level=""');

				expect(std.out).toContain("debug\t");
				expect(std.out).toContain("info\t");
				expect(std.out).toContain("warn\t");
				expect(std.out).toContain("error\t");
			});
		});

		const shells = ["bash", "zsh", "fish"] as const;

		describe.each(shells)("%s", (shell) => {
			test("should output valid shell script", async () => {
				await runWrangler(`complete ${shell}`);

				expect(std.out.length).toBeGreaterThan(100);
			});

			test("should reference wrangler complete", async () => {
				await runWrangler(`complete ${shell}`);

				expect(std.out).toContain("wrangler complete --");
			});
		});

		describe("bash", () => {
			test.skipIf(!shellAvailable("bash"))(
				"should generate valid bash syntax",
				async () => {
					await runWrangler("complete bash");

					// bash -n checks syntax without executing
					expect(() => {
						execSync("bash -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should define __wrangler_complete function", async () => {
				await runWrangler("complete bash");

				expect(std.out).toContain("__wrangler_complete()");
			});

			test("should register completion with complete builtin", async () => {
				await runWrangler("complete bash");

				expect(std.out).toContain("complete -F __wrangler_complete wrangler");
			});
		});

		describe("zsh", () => {
			test.skipIf(!shellAvailable("zsh"))(
				"should generate valid zsh syntax",
				async () => {
					await runWrangler("complete zsh");

					// zsh -n checks syntax without executing
					expect(() => {
						execSync("zsh -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should start with #compdef directive", async () => {
				await runWrangler("complete zsh");

				expect(std.out).toContain("#compdef wrangler");
			});

			test("should define _wrangler function", async () => {
				await runWrangler("complete zsh");

				expect(std.out).toContain("_wrangler()");
			});

			test("should register with compdef", async () => {
				await runWrangler("complete zsh");

				expect(std.out).toContain("compdef _wrangler wrangler");
			});
		});

		describe("fish", () => {
			test.skipIf(!shellAvailable("fish"))(
				"should generate valid fish syntax",
				async () => {
					await runWrangler("complete fish");

					// fish -n checks syntax without executing
					expect(() => {
						execSync("fish -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should define __wrangler_perform_completion function", async () => {
				await runWrangler("complete fish");

				expect(std.out).toContain("function __wrangler_perform_completion");
			});

			test("should register completion with complete builtin", async () => {
				await runWrangler("complete fish");

				expect(std.out).toContain("complete -c wrangler");
			});

			test("should use commandline for token extraction", async () => {
				await runWrangler("complete fish");

				// commandline -opc gets completed tokens
				expect(std.out).toContain("commandline -opc");
				// commandline -ct gets current token being typed
				expect(std.out).toContain("commandline -ct");
			});
		});
	});
});
