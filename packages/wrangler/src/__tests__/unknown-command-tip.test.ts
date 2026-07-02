import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { detectAgenticEnvironment } from "am-i-vibing";
import { beforeEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

vi.mock("am-i-vibing");

describe("unknown command tip", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	describe("when not in an agentic environment", () => {
		beforeEach(() => {
			vi.mocked(detectAgenticEnvironment).mockReturnValue({
				isAgentic: false,
				id: null,
				name: null,
				type: null,
			});
		});

		it("should show a short tip for human users", async ({ expect }) => {
			await expect(runWrangler("invalid-command")).rejects.toThrowError(
				/Unknown argument/
			);

			expect(std.out).toContain(
				"Tip: Run `wrangler list-commands` to see all available commands and subcommands."
			);

			// Should NOT contain the detailed agentic message
			expect(std.out).not.toContain('--base="<cmd>"');
			expect(std.out).not.toContain("Examples:");
		});

		it("should show a short tip for invalid subcommands of a valid namespace", async ({
			expect,
		}) => {
			await expect(runWrangler("d1 invalid-subcommand")).rejects.toThrow(
				/Unknown argument/
			);

			expect(std.out).toContain(
				"Tip: Run `wrangler list-commands` to see all available commands and subcommands."
			);

			// Should NOT contain the detailed agentic message
			expect(std.out).not.toContain('--base="<cmd>"');
			expect(std.out).not.toContain("Examples:");
		});
	});

	describe("when in an agentic environment", () => {
		beforeEach(() => {
			vi.mocked(detectAgenticEnvironment).mockReturnValue({
				isAgentic: true,
				id: "opencode",
				name: "OpenCode",
				type: "agent",
			});
		});

		it("should show a detailed tip with flag descriptions and examples", async ({
			expect,
		}) => {
			await expect(runWrangler("invalid-command")).rejects.toThrowError(
				/Unknown argument/
			);

			// Should contain the detailed agentic message
			expect(std.out).toContain(
				"Use `wrangler list-commands` to explore all available commands and subcommands."
			);

			// Should describe the flags
			expect(std.out).toContain("--all");
			expect(std.out).toContain('--base="<cmd>"');
			expect(std.out).toContain("--json");

			// Should include usage examples
			expect(std.out).toContain("Examples:");
			expect(std.out).toContain('wrangler list-commands --base="d1"');
			expect(std.out).toContain('wrangler list-commands --base="kv"');
			expect(std.out).toContain(
				'wrangler list-commands --base="ai-search jobs"'
			);
			expect(std.out).toContain("wrangler list-commands --all");
			expect(std.out).toContain("wrangler list-commands --json");

			// Tip should only appear once (not duplicated)
			const tipMatches = std.out.match(
				/Use `wrangler list-commands` to explore/g
			);
			expect(tipMatches).toHaveLength(1);
		});

		it("should show a detailed tip for invalid subcommands of a valid namespace", async ({
			expect,
		}) => {
			await expect(runWrangler("d1 invalid-subcommand")).rejects.toThrowError(
				/Unknown argument/
			);

			// Should contain the detailed agentic message
			expect(std.out).toContain(
				"Use `wrangler list-commands` to explore all available commands and subcommands."
			);

			// Should describe the flags
			expect(std.out).toContain("--all");
			expect(std.out).toContain('--base="<cmd>"');
			expect(std.out).toContain("--json");

			// Should include usage examples
			expect(std.out).toContain("Examples:");
		});
	});

	describe("when detectAgenticEnvironment throws", () => {
		beforeEach(() => {
			vi.mocked(detectAgenticEnvironment).mockImplementation(() => {
				throw new Error("detection failed");
			});
		});

		it("should fall back to the short tip", async ({ expect }) => {
			await expect(runWrangler("invalid-command")).rejects.toThrowError(
				/Unknown argument/
			);

			expect(std.out).toContain(
				"Tip: Run `wrangler list-commands` to see all available commands and subcommands."
			);

			// Should NOT contain the detailed agentic message
			expect(std.out).not.toContain("Examples:");
		});
	});
});
