import { describe, expect, it } from "vitest";
import { detectAgenticEnvironment } from "../agentic-check";

describe("agentic environment detection", () => {
	describe("Claude Code", () => {
		it("should detect Claude Code via CLAUDECODE env var", () => {
			const result = detectAgenticEnvironment({ CLAUDECODE: "1" });
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Claude Code");
		});
	});

	describe("OpenCode", () => {
		it("should detect OpenCode via OPENCODE_SERVER", () => {
			const result = detectAgenticEnvironment({
				OPENCODE_SERVER: "http://localhost",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("OpenCode");
		});

		it("should detect OpenCode via OPENCODE_BIN_PATH", () => {
			const result = detectAgenticEnvironment({
				OPENCODE_BIN_PATH: "/usr/bin/opencode",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("OpenCode");
		});
	});

	describe("Cursor", () => {
		it("should detect Cursor Agent mode with specific PAGER", () => {
			const result = detectAgenticEnvironment({
				CURSOR_TRACE_ID: "abc123",
				PAGER: "head -n 10000 | cat",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Cursor Agent");
		});

		it("should detect Cursor interactive mode with just CURSOR_TRACE_ID", () => {
			const result = detectAgenticEnvironment({
				CURSOR_TRACE_ID: "abc123",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Cursor");
		});

		it("should not detect Cursor Agent if PAGER is different", () => {
			const result = detectAgenticEnvironment({
				CURSOR_TRACE_ID: "abc123",
				PAGER: "less",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Cursor"); // Falls through to regular Cursor
		});
	});

	describe("Windsurf", () => {
		it("should detect Windsurf via CODEIUM_EDITOR_APP_ROOT", () => {
			const result = detectAgenticEnvironment({
				CODEIUM_EDITOR_APP_ROOT: "/path/to/windsurf",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Windsurf");
		});
	});

	describe("GitHub Copilot", () => {
		it("should detect GitHub Copilot in VS Code with GIT_PAGER=cat", () => {
			const result = detectAgenticEnvironment({
				TERM_PROGRAM: "vscode",
				GIT_PAGER: "cat",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("GitHub Copilot");
		});

		it("should not detect Copilot with just TERM_PROGRAM=vscode", () => {
			const result = detectAgenticEnvironment({
				TERM_PROGRAM: "vscode",
			});
			expect(result.isAgentic).toBe(false);
		});

		it("should not detect Copilot with wrong GIT_PAGER value", () => {
			const result = detectAgenticEnvironment({
				TERM_PROGRAM: "vscode",
				GIT_PAGER: "less",
			});
			expect(result.isAgentic).toBe(false);
		});
	});

	describe("Zed", () => {
		it("should detect Zed Agent mode with PAGER=cat", () => {
			const result = detectAgenticEnvironment({
				TERM_PROGRAM: "zed",
				PAGER: "cat",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Zed Agent");
		});

		it("should detect Zed interactive mode without PAGER=cat", () => {
			const result = detectAgenticEnvironment({
				TERM_PROGRAM: "zed",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Zed");
		});
	});

	describe("Replit", () => {
		it("should detect Replit Assistant mode", () => {
			const result = detectAgenticEnvironment({
				REPL_ID: "abc123",
				REPLIT_MODE: "assistant",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Replit Assistant");
		});

		it("should detect Replit interactive mode", () => {
			const result = detectAgenticEnvironment({
				REPL_ID: "abc123",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Replit");
		});
	});

	describe("Bolt.new", () => {
		it("should detect Bolt.new agent mode", () => {
			const result = detectAgenticEnvironment({
				SHELL: "/bin/jsh",
				npm_config_yes: "true",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Bolt.new");
		});

		it("should not detect Bolt.new without npm_config_yes", () => {
			const result = detectAgenticEnvironment({
				SHELL: "/bin/jsh",
			});
			expect(result.isAgentic).toBe(false);
		});
	});

	describe("Warp Terminal", () => {
		it("should detect Warp Terminal", () => {
			const result = detectAgenticEnvironment({
				TERM_PROGRAM: "WarpTerminal",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Warp Terminal");
		});
	});

	describe("Jules", () => {
		it("should detect Jules environment", () => {
			const result = detectAgenticEnvironment({
				HOME: "/home/jules",
				USER: "swebot",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Jules");
		});

		it("should not detect Jules with only HOME", () => {
			const result = detectAgenticEnvironment({
				HOME: "/home/jules",
			});
			expect(result.isAgentic).toBe(false);
		});
	});

	describe("Aider", () => {
		it("should detect Aider via AIDER_API_KEY", () => {
			const result = detectAgenticEnvironment({
				AIDER_API_KEY: "sk-xxx",
			});
			expect(result.isAgentic).toBe(true);
			expect(result.name).toBe("Aider");
		});
	});

	describe("non-agentic environments", () => {
		it("should return not agentic for normal environment", () => {
			const result = detectAgenticEnvironment({
				HOME: "/home/user",
				PATH: "/usr/bin",
				SHELL: "/bin/bash",
			});
			expect(result.isAgentic).toBe(false);
			expect(result.name).toBe(null);
		});

		it("should return not agentic for empty environment", () => {
			const result = detectAgenticEnvironment({});
			expect(result.isAgentic).toBe(false);
			expect(result.name).toBe(null);
		});

		it("should ignore empty string values", () => {
			const result = detectAgenticEnvironment({
				CLAUDECODE: "",
			});
			expect(result.isAgentic).toBe(false);
		});
	});
});
