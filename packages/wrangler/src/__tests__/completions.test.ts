import { execSync } from "child_process";
import { describe, test } from "vitest";
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
	describe("completions", () => {
		const std = mockConsoleMethods();
		runInTempDir();

		test("should show available shells in help", async ({ expect }) => {
			const result = runWrangler("completions --help");

			await expect(result).resolves.toBeUndefined();
			expect(std.out).toContain("Generate shell completion scripts");
			expect(std.out).toContain("wrangler completions bash");
			expect(std.out).toContain("wrangler completions zsh");
			expect(std.out).toContain("wrangler completions fish");
		});

		// =========================================================================
		// __complete command tests
		// =========================================================================
		describe("__complete", () => {
			test("should return top-level commands", async ({ expect }) => {
				await runWrangler("__complete wrangler");

				expect(std.out).toContain("deploy\t");
				expect(std.out).toContain("dev\t");
				expect(std.out).toContain("kv\t");
			});

			test("should return subcommands for namespace", async ({ expect }) => {
				// Empty string signals "complete after kv"
				await runWrangler('__complete wrangler kv ""');

				expect(std.out).toContain("namespace\t");
				expect(std.out).toContain("key\t");
			});

			test("should filter by prefix", async ({ expect }) => {
				await runWrangler("__complete wrangler kv na");

				expect(std.out).toContain("namespace\t");
				expect(std.out).not.toContain("key\t");
			});

			test("should return flags when prefix is --", async ({ expect }) => {
				// Empty string after dev, then filter by --
				await runWrangler('__complete wrangler dev "" --');

				expect(std.out).toContain("--port\t");
				expect(std.out).toContain("--config\t");
			});

			test("should exclude hidden commands", async ({ expect }) => {
				await runWrangler("__complete wrangler");

				// "check" namespace is hidden
				expect(std.out).not.toMatch(/^check\t/m);
			});

			test("should handle deeply nested commands", async ({ expect }) => {
				// Empty string signals "complete after http"
				await runWrangler('__complete wrangler queues consumer http ""');

				expect(std.out).toContain("add\t");
				expect(std.out).toContain("remove\t");
			});

			test("should output tab-separated format", async ({ expect }) => {
				await runWrangler("__complete wrangler");

				// Each line should be "value\tdescription"
				const lines = std.out.trim().split("\n");
				for (const line of lines) {
					expect(line).toMatch(/^[^\t]+\t.*$/);
				}
			});

			test("should include global flags", async ({ expect }) => {
				await runWrangler("__complete wrangler --");

				expect(std.out).toContain("--help\t");
				expect(std.out).toContain("--config\t");
			});

			test("should skip flags when building command path", async ({ expect }) => {
				// --binding should be skipped, so we're completing flags for "d1 create"
				// Use -- to prevent yargs from parsing --binding as a flag for __complete
				await runWrangler('__complete -- wrangler d1 create --binding foo ""');

				expect(std.out).toContain("--name\t");
				// Should not re-suggest d1 or create
				expect(std.out).not.toMatch(/^d1\t/m);
				expect(std.out).not.toMatch(/^create\t/m);
			});

			test("should skip flag values when building command path", async ({ expect }) => {
				// Both --config and its value should be skipped
				// Use -- to prevent yargs from parsing --config as a flag for __complete
				await runWrangler('__complete -- wrangler --config wrangler.toml kv ""');

				expect(std.out).toContain("namespace\t");
				expect(std.out).toContain("key\t");
			});
		});

		// =========================================================================
		// Shell script generation tests
		// =========================================================================
		const shells = ["bash", "zsh", "fish"] as const;

		describe.each(shells)("%s", (shell) => {
			test("should output script with begin/end markers", async ({
				expect,
			}) => {
				await runWrangler(`completions ${shell}`);

				expect(std.out).toContain("###-begin-wrangler-completions-###");
				expect(std.out).toContain("###-end-wrangler-completions-###");
			});

			test("should show shell-specific description in help", async ({
				expect,
			}) => {
				await runWrangler(`completions ${shell} --help`);

				expect(std.out).toContain(`Generate ${shell} completion script`);
			});

			test("should reference wrangler __complete", async ({ expect }) => {
				await runWrangler(`completions ${shell}`);

				expect(std.out).toContain("wrangler __complete");
			});
		});

		// =========================================================================
		// Shell syntax validation tests
		// =========================================================================
		describe("bash", () => {
			test.skipIf(!shellAvailable("bash"))(
				"should generate valid bash syntax",
				async ({ expect }) => {
					await runWrangler("completions bash");

					// bash -n checks syntax without executing
					expect(() => {
						execSync("bash -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should define _wrangler_completions function", async ({
				expect,
			}) => {
				await runWrangler("completions bash");

				expect(std.out).toContain("_wrangler_completions()");
			});

			test("should register completion with complete builtin", async ({
				expect,
			}) => {
				await runWrangler("completions bash");

				expect(std.out).toContain(
					"complete -o default -F _wrangler_completions wrangler"
				);
			});
		});

		describe("zsh", () => {
			test.skipIf(!shellAvailable("zsh"))(
				"should generate valid zsh syntax",
				async ({ expect }) => {
					await runWrangler("completions zsh");

					// zsh -n checks syntax without executing
					expect(() => {
						execSync("zsh -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should start with #compdef directive", async ({ expect }) => {
				await runWrangler("completions zsh");

				expect(std.out).toContain("#compdef wrangler");
			});

			test("should use _describe for completions", async ({ expect }) => {
				await runWrangler("completions zsh");

				expect(std.out).toContain("_describe 'wrangler' completions");
			});

			test("should register with compdef", async ({ expect }) => {
				await runWrangler("completions zsh");

				expect(std.out).toContain("compdef _wrangler wrangler");
			});
		});

		describe("fish", () => {
			test.skipIf(!shellAvailable("fish"))(
				"should generate valid fish syntax",
				async ({ expect }) => {
					await runWrangler("completions fish");

					// fish -n checks syntax without executing
					expect(() => {
						execSync("fish -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should define __wrangler_prepare_completions function", async ({
				expect,
			}) => {
				await runWrangler("completions fish");

				expect(std.out).toContain("function __wrangler_prepare_completions");
			});

			test("should register completion with complete builtin", async ({
				expect,
			}) => {
				await runWrangler("completions fish");

				expect(std.out).toContain("complete -c wrangler -f -n");
				expect(std.out).toContain("$__wrangler_comp_results");
			});

			test("should capture both completed tokens and current token", async ({
				expect,
			}) => {
				await runWrangler("completions fish");

				// commandline -opc gets completed tokens
				expect(std.out).toContain("commandline -opc");
				// commandline -ct gets current token being typed
				expect(std.out).toContain("commandline -ct");
			});
		});
	});
});
