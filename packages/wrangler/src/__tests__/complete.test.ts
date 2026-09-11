import { execSync } from "node:child_process";
import fs from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
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
			test("should return top-level commands", async ({ expect }) => {
				await runWrangler('complete -- ""');

				expect(std.out).toContain("deploy\t");
				expect(std.out).toContain("dev\t");
				expect(std.out).toContain("kv\t");
			});

			test("should return subcommands for namespace", async ({ expect }) => {
				await runWrangler('complete -- kv ""');

				expect(std.out).toContain("namespace\t");
				expect(std.out).toContain("key\t");
			});

			test("should return flags for a command", async ({ expect }) => {
				await runWrangler("complete -- dev --");

				expect(std.out).toContain("--port\t");
				expect(std.out).toContain("--ip\t");
			});

			test("should not include internal commands", async ({ expect }) => {
				await runWrangler('complete -- ""');

				expect(std.out).toContain("deploy\t");
				expect(std.out).toContain("dev\t");
				// Internal commands like "_dev" should not be exposed
				expect(std.out).not.toMatch(/^_dev\t/m);
			});

			test("should handle deeply nested commands", async ({ expect }) => {
				await runWrangler('complete -- queues consumer http ""');

				expect(std.out).toContain("add\t");
				expect(std.out).toContain("remove\t");
			});

			test("should output tab-separated format", async ({ expect }) => {
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

			test("should return options with choices", async ({ expect }) => {
				await runWrangler('complete -- dev --log-level=""');

				expect(std.out).toContain("debug\t");
				expect(std.out).toContain("info\t");
				expect(std.out).toContain("warn\t");
				expect(std.out).toContain("error\t");
			});
		});

		const shells = ["bash", "zsh", "fish"] as const;

		describe.each(shells)("%s", (shell) => {
			test("should output valid shell script", async ({ expect }) => {
				await runWrangler(`complete ${shell}`);

				expect(std.out.length).toBeGreaterThan(100);
			});

			test("should reference wrangler complete", async ({ expect }) => {
				await runWrangler(`complete ${shell}`);

				expect(std.out).toContain("wrangler complete --");
			});
		});

		describe("--executable-name", () => {
			test("should embed the overridden executable name in powershell script", async ({
				expect,
			}) => {
				await runWrangler(
					`complete powershell --executable-name "npx wrangler"`
				);

				expect(std.out).toContain("npx wrangler complete");
				// Shells can only register completions against the first word
				// actually typed ("npx"), not the full multi-word invocation.
				expect(std.out).toContain(
					"Register-ArgumentCompleter -CommandName 'npx'"
				);
				expect(std.out).not.toContain(
					"Register-ArgumentCompleter -CommandName 'npx_wrangler'"
				);
			});

			test("should embed the overridden executable name in bash script", async ({
				expect,
			}) => {
				await runWrangler(`complete bash --executable-name "npx wrangler"`);

				expect(std.out).toContain("npx wrangler complete");
			});

			test("should embed the overridden executable name in zsh script", async ({
				expect,
			}) => {
				await runWrangler(`complete zsh --executable-name "npx wrangler"`);

				expect(std.out).toContain("npx wrangler complete");
			});

			test("should default to wrangler when not provided", async ({
				expect,
			}) => {
				await runWrangler("complete bash");

				expect(std.out).toContain("wrangler complete --");
			});

			test("should reject executable names with shell metacharacters", async ({
				expect,
			}) => {
				await expect(
					runWrangler(
						`complete powershell --executable-name "wrangler; rm -rf"`
					)
				).rejects.toThrow("Invalid --executable-name value");
			});

			test.skipIf(!shellAvailable("bash"))(
				"bash script with multi-word executable name should be syntactically valid",
				async ({ expect }) => {
					await runWrangler(`complete bash --executable-name "npx wrangler"`);

					expect(() => {
						execSync("bash -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test.skipIf(!shellAvailable("zsh"))(
				"zsh script with multi-word executable name should be syntactically valid",
				async ({ expect }) => {
					await runWrangler(`complete zsh --executable-name "npx wrangler"`);

					expect(() => {
						execSync("zsh -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should register bash completion against the first word the user types", async ({
				expect,
			}) => {
				await runWrangler(`complete bash --executable-name "npx wrangler"`);

				// Shells can only register completions against the first word
				// actually typed ("npx"), not the full multi-word invocation.
				expect(std.out).toContain("complete -F __npx_wrangler_complete npx");
				expect(std.out).not.toContain(
					"complete -F __npx_wrangler_complete npx_wrangler"
				);
			});

			test("should register zsh completion against the first word the user types", async ({
				expect,
			}) => {
				await runWrangler(`complete zsh --executable-name "npx wrangler"`);

				expect(std.out).toContain("#compdef npx");
				expect(std.out).toContain("compdef _npx_wrangler npx");
				expect(std.out).not.toContain("#compdef npx_wrangler");
				expect(std.out).not.toContain("compdef _npx_wrangler npx_wrangler");
			});

			// The tests above only check the generated script's *text*. The
			// following actually exercise completion for `npx wrangler <TAB>`,
			// which is the real-world workflow issue #13591 is about: they run
			// the generated function/script in a real shell and assert on what
			// command it dispatches to, so a regression that (for example)
			// duplicates the "wrangler" word or never fires for "npx" would be
			// caught here, not just a string-contains check.
			//
			// The completion scripts capture the fake "npx" invocation's stdout
			// via `$(...)`/backticks internally (to parse completion results),
			// so a side-channel file - not stdout - is used to observe what was
			// actually invoked.
			describe("actually completing `npx wrangler <TAB>`", () => {
				const capturedArgsFile = "captured-args.txt";

				function readCapturedArgs(): string[] | undefined {
					if (!fs.existsSync(capturedArgsFile)) {
						return undefined;
					}
					return fs
						.readFileSync(capturedArgsFile, "utf8")
						.split("\n")
						.filter((line) => line.length > 0);
				}

				test.skipIf(!shellAvailable("bash"))(
					"bash: dispatches to `wrangler complete -- <args>` without duplicating a word",
					async ({ expect }) => {
						await runWrangler(`complete bash --executable-name "npx wrangler"`);
						const script = std.out;

						const wrapper = `
_get_comp_words_by_ref() {
    shift 2
    local name
    for name in "$@"; do
        case "$name" in
            cur) cur="\${COMP_WORDS[COMP_CWORD]}" ;;
            prev) prev="\${COMP_WORDS[COMP_CWORD-1]}" ;;
            words) words=("\${COMP_WORDS[@]}") ;;
            cword) cword=$COMP_CWORD ;;
        esac
    done
}
compopt() { :; }
npx() { printf '%s\\n' "$@" > "${capturedArgsFile}"; }

${script}

COMP_WORDS=(npx wrangler dev --p)
COMP_CWORD=3
__npx_wrangler_complete || true
`;
						execSync("bash", { input: wrapper });

						expect(readCapturedArgs()).toEqual([
							"wrangler",
							"complete",
							"--",
							"dev",
							"--p",
						]);
					}
				);

				test.skipIf(!shellAvailable("bash"))(
					"bash: does not dispatch when the second word doesn't match",
					async ({ expect }) => {
						await runWrangler(`complete bash --executable-name "npx wrangler"`);
						const script = std.out;

						const wrapper = `
_get_comp_words_by_ref() {
    shift 2
    local name
    for name in "$@"; do
        case "$name" in
            cur) cur="\${COMP_WORDS[COMP_CWORD]}" ;;
            prev) prev="\${COMP_WORDS[COMP_CWORD-1]}" ;;
            words) words=("\${COMP_WORDS[@]}") ;;
            cword) cword=$COMP_CWORD ;;
        esac
    done
}
compopt() { :; }
npx() { printf '%s\\n' "$@" > "${capturedArgsFile}"; }

${script}

COMP_WORDS=(npx someothertool dev --p)
COMP_CWORD=3
__npx_wrangler_complete || true
`;
						execSync("bash", { input: wrapper });

						expect(readCapturedArgs()).toBeUndefined();
					}
				);

				test.skipIf(!shellAvailable("zsh"))(
					"zsh: dispatches to `wrangler complete -- <args>` without duplicating a word",
					async ({ expect }) => {
						await runWrangler(`complete zsh --executable-name "npx wrangler"`);
						const script = std.out;

						const wrapper = `
npx() { printf '%s\\n' "$@" > "${capturedArgsFile}"; }

${script}

words=(npx wrangler dev --p)
CURRENT=4
_npx_wrangler || true
`;
						execSync("zsh", {
							input: wrapper,
							stdio: ["pipe", "pipe", "ignore"],
						});

						expect(readCapturedArgs()).toEqual([
							"wrangler",
							"complete",
							"--",
							"dev --p",
						]);
					}
				);

				test.skipIf(!shellAvailable("zsh"))(
					"zsh: does not dispatch when the second word doesn't match",
					async ({ expect }) => {
						await runWrangler(`complete zsh --executable-name "npx wrangler"`);
						const script = std.out;

						const wrapper = `
npx() { printf '%s\\n' "$@" > "${capturedArgsFile}"; }

${script}

words=(npx someothertool dev --p)
CURRENT=4
_npx_wrangler || true
`;
						execSync("zsh", {
							input: wrapper,
							stdio: ["pipe", "pipe", "ignore"],
						});

						expect(readCapturedArgs()).toBeUndefined();
					}
				);

				test.skipIf(!shellAvailable("fish"))(
					"fish: dispatches to `wrangler complete -- <args>` without duplicating a word",
					async ({ expect }) => {
						await runWrangler(`complete fish --executable-name "npx wrangler"`);
						const script = std.out;

						const wrapper = `
function npx
    printf '%s\\n' $argv > ${capturedArgsFile}
end
function commandline
    if test "$argv[1]" = "-opc"
        echo npx
        echo wrangler
        echo dev
        echo --p
    else if test "$argv[1]" = "-ct"
        echo --p
    end
end

${script}

__npx_wrangler_perform_completion > /dev/null
true
`;
						execSync("fish", { input: wrapper });

						expect(readCapturedArgs()).toEqual([
							"wrangler",
							"complete",
							"--",
							"dev --p",
							"--p",
						]);
					}
				);

				test.skipIf(!shellAvailable("fish"))(
					"fish: does not dispatch when the second word doesn't match",
					async ({ expect }) => {
						await runWrangler(`complete fish --executable-name "npx wrangler"`);
						const script = std.out;

						const wrapper = `
function npx
    printf '%s\\n' $argv > ${capturedArgsFile}
end
function commandline
    if test "$argv[1]" = "-opc"
        echo npx
        echo someothertool
        echo dev
        echo --p
    else if test "$argv[1]" = "-ct"
        echo --p
    end
end

${script}

__npx_wrangler_perform_completion > /dev/null
true
`;
						execSync("fish", { input: wrapper });

						expect(readCapturedArgs()).toBeUndefined();
					}
				);
			});
		});

		describe("bash", () => {
			test.skipIf(!shellAvailable("bash"))(
				"should generate valid bash syntax",
				async ({ expect }) => {
					await runWrangler("complete bash");

					// bash -n checks syntax without executing
					expect(() => {
						execSync("bash -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should define __wrangler_complete function", async ({ expect }) => {
				await runWrangler("complete bash");

				expect(std.out).toContain("__wrangler_complete()");
			});

			test("should register completion with complete builtin", async ({
				expect,
			}) => {
				await runWrangler("complete bash");

				expect(std.out).toContain("complete -F __wrangler_complete wrangler");
			});
		});

		describe("zsh", () => {
			test.skipIf(!shellAvailable("zsh"))(
				"should generate valid zsh syntax",
				async ({ expect }) => {
					await runWrangler("complete zsh");

					// zsh -n checks syntax without executing
					expect(() => {
						execSync("zsh -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should start with #compdef directive", async ({ expect }) => {
				await runWrangler("complete zsh");

				expect(std.out).toContain("#compdef wrangler");
			});

			test("should define _wrangler function", async ({ expect }) => {
				await runWrangler("complete zsh");

				expect(std.out).toContain("_wrangler()");
			});

			test("should register with compdef", async ({ expect }) => {
				await runWrangler("complete zsh");

				expect(std.out).toContain("compdef _wrangler wrangler");
			});
		});

		describe("fish", () => {
			test.skipIf(!shellAvailable("fish"))(
				"should generate valid fish syntax",
				async ({ expect }) => {
					await runWrangler("complete fish");

					// fish -n checks syntax without executing
					expect(() => {
						execSync("fish -n", { input: std.out });
					}).not.toThrow();
				}
			);

			test("should define __wrangler_perform_completion function", async ({
				expect,
			}) => {
				await runWrangler("complete fish");

				expect(std.out).toContain("function __wrangler_perform_completion");
			});

			test("should register completion with complete builtin", async ({
				expect,
			}) => {
				await runWrangler("complete fish");

				expect(std.out).toContain("complete -c wrangler");
			});

			test("should use commandline for token extraction", async ({
				expect,
			}) => {
				await runWrangler("complete fish");

				// commandline -opc gets completed tokens
				expect(std.out).toContain("commandline -opc");
				// commandline -ct gets current token being typed
				expect(std.out).toContain("commandline -ct");
			});
		});
	});
});
