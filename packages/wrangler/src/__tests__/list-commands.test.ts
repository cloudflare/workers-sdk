import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

describe("list-commands", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	describe("default (depth 1)", () => {
		it("should display only top-level commands", async ({ expect }) => {
			await runWrangler("list-commands");

			// Verify root
			expect(std.out).toContain("wrangler");

			// Verify tree structure characters are present
			// Note: normalizeTables() in test helpers collapses "├──" to "├─" and "└──" to "└─"
			expect(std.out).toContain("├─");
			expect(std.out).toContain("└─");

			// Verify some known top-level commands are present
			expect(std.out).toContain("deploy");
			expect(std.out).toContain("dev");
			expect(std.out).toContain("d1");
			expect(std.out).toContain("kv");
			expect(std.out).toContain("r2");

			// Verify descriptions are present (without emojis)
			expect(std.out).toMatch(/deploy\s+Deploy a Worker to Cloudflare/);
			expect(std.out).toMatch(
				/dev\s+Start a local server for developing your Worker/
			);

			// Verify no errors
			expect(std.err).toBe("");
		});

		it("should not show nested subcommands by default", async ({ expect }) => {
			await runWrangler("list-commands");

			// Without --all, subcommands like "d1 list" should not appear as nested entries
			// There should be no "│" indentation characters (the tree is flat)
			const lines = std.out.split("\n");
			const indentedLines = lines.filter((line: string) =>
				line.match(/│\s+[├└]/)
			);
			expect(indentedLines).toHaveLength(0);
		});

		it("should show ellipsis for commands that have subcommands", async ({
			expect,
		}) => {
			await runWrangler("list-commands");

			// Commands with subcommands should have a trailing "..." indicator
			expect(std.out).toMatch(/d1\s+Manage Workers D1 databases \.\.\./);
			expect(std.out).toMatch(/kv\s+Manage Workers KV Namespaces \.\.\./);
		});

		it("should not show ellipsis for leaf commands", async ({ expect }) => {
			await runWrangler("list-commands");

			// Leaf commands (no subcommands) should not have "..."
			expect(std.out).toMatch(/deploy\s+Deploy a Worker to Cloudflare$/m);
			expect(std.out).not.toMatch(
				/deploy\s+Deploy a Worker to Cloudflare \.\.\./
			);
		});

		it("should show status badges for non-stable commands", async ({
			expect,
		}) => {
			await runWrangler("list-commands");

			expect(std.out).toMatch(/\[open beta\]/);
		});

		it("should not include hidden commands", async ({ expect }) => {
			await runWrangler("list-commands");

			// hello-world is a hidden command used for testing
			expect(std.out).not.toContain("hello-world");
		});

		it("should not include alias commands by default", async ({ expect }) => {
			await runWrangler("list-commands");

			expect(std.out).not.toContain("alias of");
		});
	});

	describe("--all", () => {
		it("should show the full command tree with all nesting levels", async ({
			expect,
		}) => {
			await runWrangler("list-commands --all");

			// With --all, nested subcommands should appear
			// "│" indicates nested tree structure
			const lines = std.out.split("\n");
			const indentedLines = lines.filter((line: string) => line.includes("│"));
			expect(indentedLines.length).toBeGreaterThan(0);

			// Verify specific nested commands
			expect(std.out).toMatch(/d1\s+Manage Workers D1 databases/);

			// d1 subcommands should appear nested
			expect(std.out).toContain("list");
			expect(std.out).toContain("create");
			expect(std.out).toContain("migrations");
		});

		it("should not show ellipsis when all subcommands are visible", async ({
			expect,
		}) => {
			await runWrangler("list-commands --all");

			// With --all, no truncation happens, so no "..." should appear
			expect(std.out).not.toContain("...");
		});
	});

	describe("--base", () => {
		it("should scope output to a specific base command", async ({ expect }) => {
			await runWrangler('list-commands --base="d1"');

			// Root should be "wrangler d1"
			expect(std.out).toContain("wrangler d1");

			// Direct children of d1 should appear
			expect(std.out).toContain("list");
			expect(std.out).toContain("create");
			expect(std.out).toContain("execute");
			expect(std.out).toContain("migrations");

			// Top-level commands like "deploy" should NOT appear
			expect(std.out).not.toMatch(/├─ deploy/);
			expect(std.out).not.toMatch(/└─ deploy/);
		});

		it("should support multi-segment base paths", async ({ expect }) => {
			await runWrangler('list-commands --base="ai-search jobs"');

			// Root should be the full path
			expect(std.out).toContain("wrangler ai-search jobs");

			// Direct children of ai-search jobs should appear
			expect(std.out).toContain("cancel");
			expect(std.out).toContain("create");
			expect(std.out).toContain("get");
			expect(std.out).toContain("list");
			expect(std.out).toContain("logs");
		});

		it("should show ellipsis for nested commands when not using --all", async ({
			expect,
		}) => {
			await runWrangler('list-commands --base="d1"');

			// "migrations" has subcommands, so it should show "..."
			expect(std.out).toMatch(/migrations\s+.*\.\.\./);
		});

		it("should show full depth when combined with --all", async ({
			expect,
		}) => {
			await runWrangler('list-commands --base="d1" --all');

			// migrations subcommands should be visible
			expect(std.out).toContain("apply");

			// No ellipsis should appear
			expect(std.out).not.toContain("...");
		});

		it("should throw an error for an invalid base path", async ({ expect }) => {
			await expect(
				runWrangler('list-commands --base="nonexistent-command"')
			).rejects.toThrowError(/Unknown command/);
		});

		it("should work with --json", async ({ expect }) => {
			await runWrangler('list-commands --base="d1" --json --all');

			const output = JSON.parse(std.out);

			expect(output).toHaveProperty("commands");
			expect(output.commands.length).toBeGreaterThan(0);

			// All entries should be d1 subcommands
			const commandNames = output.commands.map(
				(cmd: { command: string }) => cmd.command
			);
			expect(commandNames).toContain("list");
			expect(commandNames).toContain("create");
			expect(commandNames).toContain("migrations");

			// Should NOT contain top-level commands
			expect(commandNames).not.toContain("deploy");
			expect(commandNames).not.toContain("dev");
		});
	});

	describe("--include-aliases", () => {
		it("should include alias commands when flag is set", async ({ expect }) => {
			await runWrangler("list-commands --include-aliases --all");

			// With --include-aliases, alias markers should appear
			expect(std.out).toContain("alias of");
		});
	});

	describe("--json", () => {
		it("should output valid JSON with correct structure", async ({
			expect,
		}) => {
			await runWrangler("list-commands --json");

			const output = JSON.parse(std.out);

			// Root structure
			expect(output).toHaveProperty("commands");
			expect(Array.isArray(output.commands)).toBe(true);
			expect(output.commands.length).toBeGreaterThan(0);

			// Each entry should have the expected fields
			const firstCommand = output.commands[0];
			expect(firstCommand).toHaveProperty("command");
			expect(firstCommand).toHaveProperty("fullCommand");
			expect(firstCommand).toHaveProperty("description");
			expect(firstCommand).toHaveProperty("status");
			expect(firstCommand).toHaveProperty("deprecated");
			expect(firstCommand).toHaveProperty("hasSubcommands");
			expect(firstCommand).toHaveProperty("subcommands");
			expect(Array.isArray(firstCommand.subcommands)).toBe(true);
		});

		it("should have empty subcommands without --all", async ({ expect }) => {
			await runWrangler("list-commands --json");

			const output = JSON.parse(std.out);

			// Find d1 which is known to have subcommands
			const d1 = output.commands.find(
				(cmd: { command: string }) => cmd.command === "d1"
			);
			expect(d1).toBeDefined();
			expect(d1.hasSubcommands).toBe(true);
			expect(d1.subcommands).toHaveLength(0);
		});

		it("should include nested subcommands with --all", async ({ expect }) => {
			await runWrangler("list-commands --json --all");

			const output = JSON.parse(std.out);

			const d1 = output.commands.find(
				(cmd: { command: string }) => cmd.command === "d1"
			);
			expect(d1).toBeDefined();
			expect(d1.fullCommand).toBe("wrangler d1");
			expect(d1.subcommands.length).toBeGreaterThan(0);

			// Verify a known d1 subcommand
			const d1List = d1.subcommands.find(
				(cmd: { command: string }) => cmd.command === "list"
			);
			expect(d1List).toBeDefined();
			expect(d1List.fullCommand).toBe("wrangler d1 list");
		});

		it("should not include hidden commands in JSON", async ({ expect }) => {
			await runWrangler("list-commands --json");

			const output = JSON.parse(std.out);

			const helloWorld = output.commands.find(
				(cmd: { command: string }) => cmd.command === "hello-world"
			);
			expect(helloWorld).toBeUndefined();
		});

		it("should include aliases in JSON when --include-aliases is set", async ({
			expect,
		}) => {
			await runWrangler("list-commands --json --include-aliases --all");

			const output = JSON.parse(std.out);

			// Check that at least one command has an aliasOf property
			const allCommands = flattenCommands(output.commands);
			const aliases = allCommands.filter(
				(cmd: { aliasOf?: string }) => cmd.aliasOf
			);
			expect(aliases.length).toBeGreaterThan(0);
		});
	});
});

/**
 * Recursively flatten a nested command tree into a flat array.
 *
 * @param commands - Array of command entries with potential subcommands
 * @returns A flat array of all commands at all depths
 */
function flattenCommands(
	commands: Array<{
		subcommands: Array<unknown>;
		[key: string]: unknown;
	}>
): Array<{ [key: string]: unknown }> {
	const result: Array<{ [key: string]: unknown }> = [];
	for (const cmd of commands) {
		result.push(cmd);
		if (cmd.subcommands && cmd.subcommands.length > 0) {
			result.push(
				...flattenCommands(
					cmd.subcommands as Array<{
						subcommands: Array<unknown>;
						[key: string]: unknown;
					}>
				)
			);
		}
	}
	return result;
}
