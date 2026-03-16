import { beforeEach, describe, test, vi } from "vitest";
import { ProgressState, terminalProgress } from "../osc-progress";
import * as streams from "../streams";

vi.mock("../streams", () => ({
	stderr: {
		isTTY: true,
		write: vi.fn(),
	},
	stdout: {
		isTTY: true,
		write: vi.fn(),
	},
}));

describe("osc-progress", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		delete process.env.WRANGLER_NO_OSC_PROGRESS;
		delete process.env.TERM_PROGRAM;
		delete process.env.WT_SESSION;
		delete process.env.ConEmuANSI;
		delete process.env.TERM;
	});

	describe("terminalProgress.isSupported", () => {
		test("returns `false` when `WRANGLER_NO_OSC_PROGRESS` is set", ({
			expect,
		}) => {
			process.env.WRANGLER_NO_OSC_PROGRESS = "1";
			process.env.TERM_PROGRAM = "ghostty";

			expect(terminalProgress.isSupported).toBe(false);
		});

		test("returns `false` when `stdout` is not a TTY", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = false;
			process.env.TERM_PROGRAM = "ghostty";

			expect(terminalProgress.isSupported).toBe(false);
		});

		test("returns `true` for Ghostty terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			expect(terminalProgress.isSupported).toBe(true);
		});

		test("returns `true` for WezTerm terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "WezTerm";

			expect(terminalProgress.isSupported).toBe(true);
		});

		test("returns `true` for iTerm terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "iTerm.app";

			expect(terminalProgress.isSupported).toBe(true);
		});

		test("returns `true` for Windows Terminal", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.WT_SESSION = "some-session-id";

			expect(terminalProgress.isSupported).toBe(true);
		});

		test("returns `true` for ConEmu with ANSI enabled", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.ConEmuANSI = "ON";

			expect(terminalProgress.isSupported).toBe(true);
		});

		test("returns `true` for xterm-compatible terminals", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "xterm-256color";

			expect(terminalProgress.isSupported).toBe(true);
		});

		test("returns `false` for unknown terminals", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "some-random-terminal";

			expect(terminalProgress.isSupported).toBe(false);
		});
	});

	describe("terminalProgress.setProgress", () => {
		test("writes normal progress sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			terminalProgress.setProgress(50);

			expect(streams.stdout.write).toHaveBeenCalledWith(
				`\x1b]9;4;${ProgressState.Normal};50\x07`
			);
		});

		test("does not write when terminal is not supported", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "dumb";

			terminalProgress.setProgress(50);

			expect(streams.stdout.write).not.toHaveBeenCalled();
		});

		test("does not write when disabled via env var", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";
			process.env.WRANGLER_NO_OSC_PROGRESS = "1";

			terminalProgress.setProgress(50);

			expect(streams.stdout.write).not.toHaveBeenCalled();
		});
	});

	describe("terminalProgress.setIndeterminate", () => {
		test("writes indeterminate progress sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			terminalProgress.setIndeterminate();

			expect(streams.stdout.write).toHaveBeenCalledWith(
				`\x1b]9;4;${ProgressState.Indeterminate};0\x07`
			);
		});
	});

	describe("terminalProgress.setError", () => {
		test("writes error state sequence", ({ expect }) => {
			vi.useFakeTimers();
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			terminalProgress.setError();

			expect(streams.stdout.write).toHaveBeenCalledWith(
				`\x1b]9;4;${ProgressState.Error};100\x07`
			);

			// Advance timers to trigger auto-clear
			vi.advanceTimersByTime(500);

			expect(streams.stdout.write).toHaveBeenCalledWith(
				`\x1b]9;4;${ProgressState.Hidden};0\x07`
			);

			vi.useRealTimers();
		});
	});

	describe("terminalProgress.setWarning", () => {
		test("writes warning state sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			terminalProgress.setWarning();

			expect(streams.stdout.write).toHaveBeenCalledWith(
				`\x1b]9;4;${ProgressState.Warning};100\x07`
			);
		});
	});

	describe("terminalProgress.clear", () => {
		test("writes hidden state sequence", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM_PROGRAM = "ghostty";

			terminalProgress.clear();

			expect(streams.stdout.write).toHaveBeenCalledWith(
				`\x1b]9;4;${ProgressState.Hidden};0\x07`
			);
		});

		test("does not write when terminal is not supported", ({ expect }) => {
			vi.mocked(streams.stdout).isTTY = true;
			process.env.TERM = "dumb";

			terminalProgress.clear();

			expect(streams.stdout.write).not.toHaveBeenCalled();
		});
	});
});
